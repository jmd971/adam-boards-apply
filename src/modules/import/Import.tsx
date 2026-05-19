import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { parseFEC, detectCompany, detectCompanyName, detectPeriod, type ParseWarning, lastFecError } from '@/lib/fec'
import { useAppStore } from '@/store'
import { Spinner } from '@/components/ui'
import type { ParsedFEC } from '@/lib/fec'

interface PendingImport {
  file: File
  company: string
  period: string
  fy: string
  parsed: ParsedFEC
  hasConflict: boolean
  cancelled: boolean
}

interface ImportResult {
  file: string
  company: string
  period: string
  months: number
  entries: number
  error?: string
  warnings?: ParseWarning[]
  skippedLines?: number
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 Mo

export function Import() {
  const role     = useAppStore(s => s.role)
  const tenantId = useAppStore(s => s.tenantId)
  const qc       = useQueryClient()
  const canEdit  = role === 'admin' || role === 'comptable' || role === 'superadmin'

  const [checking,  setChecking]  = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragOver,  setDragOver]  = useState<string | null>(null)
  const [pending,   setPending]   = useState<PendingImport[]>([])
  const [results,   setResults]   = useState<ImportResult[]>([])

  // Étape 1 : parse + vérification des conflits
  const handleFiles = useCallback(async (files: FileList | null, fp?: { period: string }) => {
    if (!files || !canEdit) return
    setChecking(true)
    const newPending: PendingImport[] = []

    for (const file of Array.from(files)) {
      try {
        if (file.size > MAX_FILE_SIZE) {
          setResults(r => [...r, { file: file.name, company: '', period: '', months: 0, entries: 0,
            error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(0)} Mo). Limite : ${MAX_FILE_SIZE / 1024 / 1024} Mo.` }])
          continue
        }
        const text = await file.text()
        const parsed = parseFEC(text)
        if (!parsed) {
          setResults(r => [...r, { file: file.name, company: '', period: '', months: 0, entries: 0, error: lastFecError || 'Format FEC non reconnu' }])
          continue
        }

        const company = detectCompany(file.name)
        const { period, fy } = fp
          ? { period: fp.period as 'N' | 'N-1' | 'N-2', fy: detectPeriod(parsed.months).fy }
          : detectPeriod(parsed.months)

        // Rejeter les FEC trop anciens (N-3 et au-delà — ex : 2023 en 2026).
        // Seules N, N-1 et N-2 sont supportés.
        const fyNum = parseInt(fy)
        const cy = new Date().getFullYear()
        if (fyNum < cy - 2) {
          setResults(r => [...r, { file: file.name, company: '', period: '', months: 0, entries: 0,
            error: `FEC ${fy} trop ancien — seules les années N (${cy}), N-1 (${cy-1}) et N-2 (${cy-2}) sont importables.` }])
          continue
        }

        const { data } = await sb.from('company_data')
          .select('company_key')
          .eq('tenant_id', tenantId)
          .eq('company_key', company)
          .eq('period', period)
          .maybeSingle()

        newPending.push({ file, company, period, fy, parsed, hasConflict: !!data, cancelled: false })
      } catch (e: any) {
        setResults(r => [...r, { file: file.name, company: '', period: '', months: 0, entries: 0, error: e.message }])
      }
    }

    setChecking(false)
    if (newPending.length > 0) setPending(p => [...newPending, ...p])
  }, [canEdit, tenantId])

  // Étape 2 : import des fichiers confirmés
  const confirmImport = async () => {
    const toImport = pending.filter(p => !p.cancelled)
    if (!toImport.length) return
    setImporting(true)
    const newResults: ImportResult[] = []

    for (const item of toImport) {
      try {
        const { error } = await sb.from('company_data').upsert({
          tenant_id:    tenantId,
          company_key:  item.company,
          company_name: detectCompanyName(item.file.name),
          period:       item.period,
          fiscal_year:  item.fy,
          pl_data:      item.parsed.plData,
          bilan_data:   item.parsed.bilanData,
          months_covered: item.parsed.months,
          entry_count: item.parsed.entryCount,
          source:      'manual',
          client_data: item.parsed.clientData,
          ve_entries:  item.parsed.veEntries,
        }, { onConflict: 'tenant_id,company_key,period' })

        if (error) throw error

        newResults.push({
          file:         item.file.name,
          company:      item.company,
          period:       item.period,
          months:       item.parsed.months.length,
          entries:      item.parsed.entryCount,
          warnings:     item.parsed.warnings,
          skippedLines: item.parsed.skippedLines,
        })
      } catch (e: any) {
        newResults.push({ file: item.file.name, company: '', period: '', months: 0, entries: 0, error: e.message })
      }
    }

    setPending([])
    setResults(r => [...newResults, ...r])
    setImporting(false)

    // Invalide le cache TanStack Query → useCompanyData refetch → CR/SIG/etc.
    // voient les nouvelles données sans refresh manuel de la page.
    if (newResults.some(r => !r.error)) {
      qc.invalidateQueries({ queryKey: ['companyData'] })
    }
  }

  const cancelPending = (idx: number) =>
    setPending(p => p.map((item, i) => i === idx ? { ...item, cancelled: true } : item))

  const dropZones = [
    { id: 'n2', label: 'N-2 (Avant-dernier)',      period: 'N-2' },
    { id: 'n1', label: 'N-1 (Exercice précédent)', period: 'N-1' },
    { id: 'n',  label: 'N (Exercice en cours)',     period: 'N'   },
  ]

  return (
    <div className="px-6 py-5 max-w-3xl">
      <h2 className="text-base font-bold text-white mb-1">Import fichiers FEC</h2>
      <p className="text-xs text-muted mb-6">
        Format EBP Grand Livre (.txt) — glissez les fichiers dans la zone correspondante ou cliquez pour sélectionner.
      </p>

      {canEdit ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {dropZones.map(z => (
              <div key={z.id}>
                <div className="text-xs font-semibold text-muted mb-2">{z.label}</div>
                <label
                  className="block rounded-xl p-6 text-center cursor-pointer transition-all"
                  style={{
                    border: `2px dashed ${dragOver === z.id ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                    background: dragOver === z.id ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                  onDragOver={e => { e.preventDefault(); setDragOver(z.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => { e.preventDefault(); setDragOver(null); handleFiles(e.dataTransfer.files, { period: z.period }) }}
                >
                  <div className="text-3xl mb-2">📤</div>
                  <div className="text-xs text-muted">Glisser les fichiers FEC</div>
                  <div className="text-xs text-muted mt-1">ou cliquer pour sélectionner</div>
                  <input
                    type="file"
                    multiple
                    accept=".txt,.csv"
                    className="hidden"
                    onChange={e => handleFiles(e.target.files, { period: z.period })}
                  />
                </label>
              </div>
            ))}
          </div>

          {checking && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Spinner size={18} />
              <span className="text-xs text-brand-blue">Analyse des fichiers...</span>
            </div>
          )}

          {pending.length > 0 && !checking && (
            <div className="mb-6 rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-xs font-semibold text-white">Prêt à importer</span>
                <span className="text-xs text-muted">{pending.filter(p => !p.cancelled).length} fichier(s)</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {pending.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs"
                    style={{ opacity: item.cancelled ? 0.4 : 1, background: 'rgba(255,255,255,0.02)' }}>
                    <span className="font-mono text-muted flex-1 truncate">{item.file.name}</span>
                    <span className="text-white">{item.company} · {item.period}</span>
                    {item.hasConflict && !item.cancelled && (
                      <span className="px-2 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        ⚠️ Écrase les données existantes
                      </span>
                    )}
                    {!item.cancelled
                      ? <button onClick={() => cancelPending(i)} className="text-muted hover:text-brand-red transition-colors ml-1">✕</button>
                      : <span className="text-muted text-xs">Annulé</span>
                    }
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={confirmImport}
                  disabled={importing || pending.every(p => p.cancelled)}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
                  style={{ background: '#3b82f6', color: 'white', opacity: pending.every(p => p.cancelled) ? 0.5 : 1 }}>
                  {importing
                    ? <span className="flex items-center gap-2"><Spinner size={12} /> Import...</span>
                    : `Importer (${pending.filter(p => !p.cancelled).length})`}
                </button>
                <button onClick={() => setPending([])} className="text-xs text-muted hover:text-white transition-colors">
                  Tout annuler
                </button>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted">Résultats</div>
                <button onClick={() => setResults([])} className="text-xs text-muted hover:text-white transition-colors">Effacer</button>
              </div>
              {results.map((r, i) => (
                <div key={i}>
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs"
                    style={{ background: r.error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' }}>
                    <span>{r.error ? '❌' : '✅'}</span>
                    <span className="font-mono text-muted">{r.file}</span>
                    {r.error
                      ? <span className="text-brand-red">{r.error}</span>
                      : <span className="text-brand-green">{r.company} · {r.period} · {r.months} mois · {r.entries.toLocaleString()} écritures
                          {r.skippedLines ? <span style={{ color:'#f59e0b' }}> · {r.skippedLines} ignorée(s)</span> : null}
                        </span>
                    }
                  </div>
                  {!r.error && r.warnings && r.warnings.length > 0 && (
                    <div style={{ marginLeft:32, marginBottom:4 }}>
                      {r.warnings.map((w, j) => (
                        <div key={j} style={{ fontSize:11, paddingLeft:8, color: w.type === 'format' ? '#ef4444' : w.type === 'skip' ? '#f59e0b' : '#64748b' }}>
                          {w.type === 'format' ? '⚠️' : w.type === 'skip' ? '⏭️' : 'ℹ️'} {w.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="px-4 py-3 rounded-xl text-xs text-muted"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          L'import de fichiers FEC est réservé aux rôles Administrateur et Comptable. Contactez votre administrateur.
        </div>
      )}
    </div>
  )
}
