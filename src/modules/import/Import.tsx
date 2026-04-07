import { useState, useCallback } from 'react'
import { sb } from '@/lib/supabase'
import { parseFEC, detectCompany, detectPeriod, type ParseWarning } from '@/lib/fec'
import { useAppStore } from '@/store'
import { Spinner } from '@/components/ui'

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

export function Import() {
  const role = useAppStore(s => s.role)
  const tenantId = useAppStore(s => s.tenantId)
  const canEdit = role === 'admin' || role === 'editor'
  const [importing, setImporting]   = useState(false)
  const [dragOver, setDragOver]     = useState<string | null>(null)
  const [results, setResults]       = useState<ImportResult[]>([])

  const handleFiles = useCallback(async (files: FileList | null, fp?: { period: string }) => {
    if (!files || !canEdit) return
    setImporting(true)
    const newResults: ImportResult[] = []

    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = parseFEC(text)
        if (!parsed) throw new Error('Format FEC non reconnu')

        const co = detectCompany(file.name)
        const { period, fy } = fp
          ? { period: fp.period as 'N' | 'N-1', fy: detectPeriod(parsed.months).fy }
          : detectPeriod(parsed.months)

        const { error } = await sb.from('company_data').upsert({
          tenant_id: tenantId,
          company_key: co,
          period,
          fiscal_year: fy,
          pl_data: parsed.plData,
          bilan_data: parsed.bilanData,
          months: parsed.months,
          entry_count: parsed.entryCount,
          source: 'manual',
          client_data: parsed.clientData,
          ve_entries: parsed.veEntries,
        }, { onConflict: 'tenant_id,company_key,period' })

        if (error) throw error

        newResults.push({
          file: file.name,
          company: co,
          period,
          months: parsed.months.length,
          entries: parsed.entryCount,
          warnings: parsed.warnings,
          skippedLines: parsed.skippedLines,
        })
      } catch (e: any) {
        newResults.push({ file: file.name, company: '', period: '', months: 0, entries: 0, error: e.message })
      }
    }

    setResults(r => [...newResults, ...r])
    setImporting(false)
  }, [canEdit])

  const dropZones = [
    { id: 'n2', label: 'N-2 (Avant-dernier)', period: 'N-2' },
    { id: 'n1', label: 'N-1 (Exercice précédent)', period: 'N-1' },
    { id: 'n',  label: 'N (Exercice en cours)',    period: 'N'   },
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

          {importing && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Spinner size={18} />
              <span className="text-xs text-brand-blue">Import en cours...</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted mb-2">Résultats</div>
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
          Droits insuffisants pour importer des fichiers.
        </div>
      )}
    </div>
  )
}
