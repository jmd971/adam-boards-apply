import React, { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import type { SaleTransaction } from '@/lib/rfm'

const FIELDS = [
  { key: 'client_nom',   label: 'Nom client',           required: true  },
  { key: 'date_achat',   label: 'Date achat',            required: true  },
  { key: 'montant',      label: 'Montant (€)',            required: true  },
  { key: 'client_email', label: 'Email',                 required: false },
  { key: 'client_phone', label: 'Téléphone',             required: false },
  { key: 'produit',      label: 'Produit / Prestation',  required: false },
  { key: 'commande_ref', label: 'N° Facture',            required: false },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

const GUESSES: Record<string, FieldKey> = {
  'client':               'client_nom',
  'nom':                  'client_nom',
  'name':                 'client_nom',
  'customer':             'client_nom',
  'date':                 'date_achat',
  'date achat':           'date_achat',
  'date de facture':      'date_achat',
  'montant':              'montant',
  'montant total':        'montant',
  'total':                'montant',
  'amount':               'montant',
  'prix':                 'montant',
  'booked total amount':  'montant',
  'email':                'client_email',
  'courriel':             'client_email',
  'tel':                  'client_phone',
  'téléphone':            'client_phone',
  'telephone':            'client_phone',
  'phone':                'client_phone',
  'description':          'produit',
  'produit':              'produit',
  'article':              'produit',
  'service':              'produit',
  'facture':              'commande_ref',
  'n° de facture':        'commande_ref',
  'invoice':              'commande_ref',
  'ref':                  'commande_ref',
}

function autoGuess(headers: string[]): Record<string, FieldKey | ''> {
  return Object.fromEntries(headers.map(h => [h, GUESSES[h.toLowerCase().trim()] ?? '']))
}

function parseDate(raw: string): string {
  if (!raw) return ''
  const s = String(raw).trim()
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const n = Number(s)
  if (!isNaN(n) && n > 40000) return new Date((n - 25569) * 86400000).toISOString().slice(0, 10)
  return s.slice(0, 10)
}

function buildTransactions(rows: any[], mapping: Record<string, FieldKey | ''>): SaleTransaction[] {
  return rows.flatMap(row => {
    const mapped: Record<FieldKey, string> = {} as any
    for (const [col, field] of Object.entries(mapping)) {
      if (field && row[col] != null && row[col] !== '' && !mapped[field as FieldKey]) {
        mapped[field as FieldKey] = String(row[col]).trim()
      }
    }
    if (!mapped.client_nom || !mapped.date_achat || !mapped.montant) return []
    const montant = parseFloat(String(mapped.montant).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0
    if (montant <= 0) return []
    const emailClean = mapped.client_email?.toLowerCase() || undefined
    const clientKey  = emailClean || mapped.client_nom.toLowerCase()
    return [{
      client_key:   clientKey,
      client_nom:   mapped.client_nom,
      client_email: emailClean,
      client_phone: mapped.client_phone || undefined,
      date_achat:   parseDate(mapped.date_achat),
      montant,
      produit:      mapped.produit || undefined,
      commande_ref: mapped.commande_ref || undefined,
    }]
  })
}

interface Props {
  onImport: (txs: SaleTransaction[]) => void
  onCancel: () => void
}

type Step = 'upload' | 'mapping' | 'preview'

export function ImportWizard({ onImport, onCancel }: Props) {
  const [step,     setStep]     = useState<Step>('upload')
  const [headers,  setHeaders]  = useState<string[]>([])
  const [rows,     setRows]     = useState<any[]>([])
  const [mapping,  setMapping]  = useState<Record<string, FieldKey | ''>>({})
  const [dragging, setDragging] = useState(false)
  const [filename, setFilename] = useState('')

  const loadFile = useCallback((file: File) => {
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const data = e.target?.result
      const wb   = XLSX.read(data, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const all  = XLSX.utils.sheet_to_json<any>(ws, { raw: false, defval: '' })
      if (!all.length) return
      const hdrs = Object.keys(all[0])
      setHeaders(hdrs)
      setRows(all)
      setMapping(autoGuess(hdrs))
      setStep('mapping')
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }, [loadFile])

  const preview  = buildTransactions(rows.slice(0, 5), mapping)
  const allTxs   = buildTransactions(rows, mapping)
  const missing  = FIELDS.filter(f => f.required && !Object.values(mapping).includes(f.key)).map(f => f.label)

  const btnSt = (primary = false): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
    background: primary ? 'var(--blue)' : 'var(--bg-2)',
    color: primary ? '#fff' : 'var(--text-1)',
    opacity: primary && missing.length > 0 ? 0.4 : 1,
  })

  const selSt: React.CSSProperties = {
    background: 'var(--bg-0)', border: '1px solid var(--border-1)',
    borderRadius: 6, color: 'var(--text-0)', padding: '5px 8px',
    fontSize: 11, outline: 'none', width: 'auto', minWidth: 180,
  }

  const stepLabel = (s: Step) => s === 'upload' ? 'Fichier' : s === 'mapping' ? 'Colonnes' : 'Aperçu'
  const steps: Step[] = ['upload', 'mapping', 'preview']

  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      {/* Indicateur d'étapes */}
      <div style={{ display:'flex', gap:8, marginBottom:28, alignItems:'center' }}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{
              width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:700,
              background: step === s ? 'var(--blue)' : 'var(--bg-2)',
              color: step === s ? '#fff' : 'var(--text-3)',
            }}>{i + 1}</div>
            <div style={{ fontSize:11, color: step === s ? 'var(--text-0)' : 'var(--text-3)', fontWeight: step === s ? 600 : 400 }}>
              {stepLabel(s)}
            </div>
            {i < 2 && <div style={{ flex:1, height:1, background:'var(--border-1)' }}/>}
          </React.Fragment>
        ))}
      </div>

      {/* ÉTAPE 1 : Upload */}
      {step === 'upload' && (
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          style={{
            border: `2px dashed ${dragging ? 'var(--blue)' : 'var(--border-1)'}`,
            borderRadius: 'var(--radius-lg)', padding: '56px 32px', textAlign: 'center',
            background: dragging ? 'rgba(59,130,246,0.05)' : 'var(--bg-1)',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize:40, marginBottom:16 }}>📂</div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-0)', marginBottom:6 }}>
            Glissez votre fichier ici
          </div>
          <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:24 }}>
            CSV ou Excel (.xlsx) — SumUp, Square, Lightspeed…
          </div>
          <label style={{ ...btnSt(true), display:'inline-block', cursor:'pointer', opacity:1 }}>
            Parcourir
            <input type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }} style={{ display:'none' }}/>
          </label>
        </div>
      )}

      {/* ÉTAPE 2 : Mapping */}
      {step === 'mapping' && (
        <div>
          <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:16 }}>
            Fichier : <strong style={{ color:'var(--text-0)' }}>{filename}</strong>
            {' · '}<span style={{ color:'var(--green)' }}>{rows.length} lignes</span>
          </div>
          <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-md)', border:'1px solid var(--border-1)', overflow:'hidden', marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg-0)' }}>
                  {['Colonne du fichier', 'Champ Adam Boards', 'Exemple'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-2)', borderBottom:'1px solid var(--border-1)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={h} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding:'8px 16px', fontSize:11, color:'var(--text-0)', fontFamily:'monospace' }}>{h}</td>
                    <td style={{ padding:'8px 16px' }}>
                      <select value={mapping[h] ?? ''} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value as FieldKey | '' }))} style={selSt}>
                        <option value="">— Ignorer —</option>
                        {FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding:'8px 16px', fontSize:10, color:'var(--text-3)', fontFamily:'monospace', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {String(rows[0]?.[h] ?? '').slice(0, 40)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && (
            <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 14px', fontSize:11, color:'var(--red)', marginBottom:16 }}>
              ⚠️ Champs obligatoires non mappés : {missing.join(', ')}
            </div>
          )}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setStep('upload')} style={btnSt()}>← Retour</button>
            <button onClick={() => setStep('preview')} disabled={missing.length > 0} style={btnSt(true)}>Aperçu →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 : Aperçu */}
      {step === 'preview' && (
        <div>
          <div style={{ display:'flex', gap:16, marginBottom:20 }}>
            {[
              { label:'Lignes importées', value:allTxs.length,                                    color:'var(--green)' },
              { label:'Clients uniques',  value:new Set(allTxs.map(t => t.client_key)).size,      color:'var(--blue)'  },
              { label:'Lignes ignorées',  value:rows.length - allTxs.length,                      color:'var(--amber)' },
            ].map(k => (
              <div key={k.label} style={{ flex:1, background:'var(--bg-1)', border:'1px solid var(--border-1)', borderRadius:'var(--radius-md)', padding:'14px 16px' }}>
                <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:'monospace' }}>{k.value}</div>
                <div style={{ fontSize:10, color:'var(--text-3)', marginTop:4 }}>{k.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:10 }}>Aperçu (5 premières lignes) :</div>
          <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-md)', border:'1px solid var(--border-1)', overflow:'auto', marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'var(--bg-0)' }}>
                  {['Client','Date','Montant','Produit','Email'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'var(--text-2)', fontWeight:700, borderBottom:'1px solid var(--border-1)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'7px 12px', color:'var(--text-0)' }}>{t.client_nom}</td>
                    <td style={{ padding:'7px 12px', fontFamily:'monospace', color:'var(--text-2)' }}>{t.date_achat}</td>
                    <td style={{ padding:'7px 12px', fontFamily:'monospace', color:'var(--green)', textAlign:'right' }}>{t.montant.toFixed(2)} €</td>
                    <td style={{ padding:'7px 12px', color:'var(--text-3)' }}>{t.produit ?? '—'}</td>
                    <td style={{ padding:'7px 12px', color:'var(--text-3)' }}>{t.client_email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => setStep('mapping')} style={btnSt()}>← Retour</button>
            <button onClick={() => onImport(allTxs)} style={{ ...btnSt(true), opacity:1 }}>
              ✓ Importer {allTxs.length} transactions
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop:20, textAlign:'center' }}>
        <button onClick={onCancel} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'var(--text-3)' }}>
          Annuler
        </button>
      </div>
    </div>
  )
}
