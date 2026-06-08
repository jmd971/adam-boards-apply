import { useState, useMemo, useRef } from 'react'
import type { ManualEntry } from '@/types'
import { CATEGORIES, SUB_ALIASES, normSub } from '@/lib/categories'

// ─── Types ────────────────────────────────────────────────────────────────────
export type CsvRow = {
  id: number
  selected: boolean
  date: string
  label: string
  counterpart: string
  amount_ht: number
  amount_ttc: number
  category: ManualEntry['category']
  subcategory: string
}

interface Props {
  companyKeys: string[]
  defaultCompanyKey: string
  companyNames: Record<string, string>
  onImport: (companyKey: string, rows: CsvRow[]) => Promise<void>
  saving: boolean
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────
function parseDate(raw: string): string {
  if (!raw) return ''
  const dmy = raw.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  return raw.trim()
}

function parseMontant(raw: string): number {
  if (!raw) return 0
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')) || 0
}

function splitCSV(line: string, sep: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  result.push(cur.trim())
  return result
}

function detectCat(raw: string): ManualEntry['category'] {
  const v = normSub(raw)
  if (v.includes('vente') || v.includes('produit') || v.includes('recette')) return 'Vente'
  if (v.includes('achat') || v.includes('fournisseur')) return 'Achat'
  if (v.includes('immo')) return 'Immobilisation'
  return 'Depense'
}

export function parseCSVText(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const rawHeaders = splitCSV(lines[0], sep)
  const headers = rawHeaders.map(h => normSub(h.replace(/[^a-z0-9àâéèêëîïôùûüç\s_]/gi, ' ').trim()))

  const find = (...candidates: string[]): number => {
    for (const cand of candidates) {
      const i = headers.findIndex(h => h.includes(cand) || cand.includes(h))
      if (i >= 0) return i
    }
    return -1
  }

  const idxDate        = find('date')
  const idxLabel       = find('libelle', 'label', 'description', 'designation', 'objet', 'intitule')
  const idxCounterpart = find('contrepartie', 'counterpart', 'tiers', 'fournisseur', 'client', 'nom', 'raison')
  const idxHT          = find('montant_ht', 'amount_ht', 'prix_ht', 'ht', 'net_ht', 'base_ht')
  const idxTTC         = find('montant_ttc', 'amount_ttc', 'prix_ttc', 'ttc', 'total_ttc', 'total')
  const idxDebit       = find('debit', 'sortie', 'decaissement')
  const idxCredit      = find('credit', 'entree', 'encaissement')
  const idxMontant     = find('montant', 'amount', 'valeur')
  const idxCat         = find('categorie', 'category', 'type', 'nature')
  const idxSub         = find('sous_categorie', 'subcategory', 'sous_cat', 'compte', 'poste')

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSV(lines[i], sep)
    if (cols.every(c => !c)) continue
    const get = (idx: number) => idx >= 0 ? cols[idx]?.trim() ?? '' : ''

    let ht = 0, ttc = 0
    if (idxHT >= 0)          ht  = Math.abs(parseMontant(get(idxHT)))
    else if (idxDebit >= 0)  ht  = Math.abs(parseMontant(get(idxDebit)))
    else if (idxCredit >= 0) ht  = Math.abs(parseMontant(get(idxCredit)))
    else if (idxMontant >= 0) ht = Math.abs(parseMontant(get(idxMontant)))

    if (idxTTC >= 0) ttc = Math.abs(parseMontant(get(idxTTC)))
    if (!ttc) ttc = ht

    const rawCat = get(idxCat)
    const rawSub = get(idxSub)

    rows.push({
      id: i,
      selected: true,
      date:        parseDate(get(idxDate)),
      label:       get(idxLabel),
      counterpart: get(idxCounterpart),
      amount_ht:   ht,
      amount_ttc:  ttc,
      category:    rawCat ? detectCat(rawCat) : 'Depense',
      subcategory: rawSub,
    })
  }
  return rows
}

// ─── Sub-category combobox (partagé pour ligne individuelle et global) ────────
function SubCombo({ category, value, onChange }: {
  category: ManualEntry['category']
  value: string
  onChange: (v: string) => void
}) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const catSubs = CATEGORIES.find(c => c.cat === category)?.subs ?? []

  const filtered = useMemo(() => {
    const q = normSub(search.trim())
    if (!q) return catSubs
    return catSubs.filter(sub =>
      normSub(sub).includes(q) ||
      (SUB_ALIASES[sub] ?? []).some(a => normSub(a).includes(q) || q.includes(normSub(a)))
    )
  }, [search, catSubs])

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '5px 22px 5px 7px', borderRadius: 6, fontSize: 11,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: value ? '#93c5fd' : '#94a3b8', outline: 'none', boxSizing: 'border-box',
    cursor: 'pointer',
  }

  return (
    <div style={{ position: 'relative', minWidth: 160 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={open ? search : (value || '')}
          placeholder={value ? '' : 'Chercher…'}
          title={value}
          onChange={e => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
          onFocus={() => { setSearch(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          style={inputSt}
        />
        <span
          style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: '#475569', cursor: 'pointer', pointerEvents: value ? 'auto' : 'none' }}
          onMouseDown={e => { e.preventDefault(); onChange(''); setSearch('') }}
        >{value ? '✕' : '▾'}</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, minWidth: 220, zIndex: 300,
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 7, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {filtered.length === 0
            ? <div style={{ padding: '8px 10px', fontSize: 11, color: '#475569', fontStyle: 'italic' }}>Aucun résultat</div>
            : filtered.map(sub => (
              <div key={sub}
                onMouseDown={() => { onChange(sub); setSearch(''); setOpen(false) }}
                style={{
                  padding: '7px 10px', fontSize: 11, cursor: 'pointer',
                  color: sub === value ? '#93c5fd' : '#cbd5e1',
                  background: sub === value ? 'rgba(59,130,246,0.18)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
                onMouseEnter={e => { if (sub !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { e.currentTarget.style.background = sub === value ? 'rgba(59,130,246,0.18)' : 'transparent' }}
              >{sub}</div>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export function CsvImportView({ companyKeys, defaultCompanyKey, companyNames, onImport, saving }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows,       setRows]       = useState<CsvRow[]>([])
  const [step,       setStep]       = useState<'idle' | 'preview'>('idle')
  const [fileName,   setFileName]   = useState('')
  const [parseErr,   setParseErr]   = useState<string | null>(null)
  const [companyKey, setCompanyKey] = useState(defaultCompanyKey)
  // Affectation globale
  const [gCat, setGCat] = useState<ManualEntry['category']>('Depense')
  const [gSub, setGSub] = useState('')

  const selectedRows = rows.filter(r => r.selected)
  const allChecked   = rows.length > 0 && rows.every(r => r.selected)
  const someInvalid  = selectedRows.some(r => !r.date || r.amount_ht === 0)

  // ── Chargement du fichier ──────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setParseErr(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      const parsed = parseCSVText(text)
      if (parsed.length === 0) { setParseErr('Fichier vide ou format non reconnu.'); return }
      setRows(parsed)
      setStep('preview')
    } catch (e: any) {
      setParseErr(e?.message ?? 'Erreur de lecture')
    }
  }

  // ── Affectation globale ────────────────────────────────────────────────────
  const applyGlobal = () => {
    setRows(rs => rs.map(r => ({
      ...r,
      category:    gCat,
      subcategory: gSub || r.subcategory,
    })))
  }

  const applyGlobalCatOnly = () => {
    setRows(rs => rs.map(r => ({ ...r, category: gCat })))
  }

  // ── Modif individuelle ─────────────────────────────────────────────────────
  const updateRow = (id: number, patch: Partial<CsvRow>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  // ── Import final ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    await onImport(companyKey, selectedRows)
    setRows([])
    setStep('idle')
    setFileName('')
  }

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const inputSt: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 7, fontSize: 12,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#f1f5f9', outline: 'none',
  }

  // ── Étape 1 : sélection fichier ────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div style={{ background: '#0f172a', borderRadius: 12, padding: 28, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#14b8a6', marginBottom: 6 }}>Import fichier ventes / achats</div>
        <div style={{ fontSize: 11, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>
          Accepte les fichiers <strong style={{ color: '#94a3b8' }}>CSV, TXT</strong> (séparateurs , ; ou tabulation).<br />
          Colonnes détectées automatiquement : date, libellé, tiers, montant HT, montant TTC, catégorie.<br />
          Export Excel → <em>Fichier → Enregistrer sous → CSV</em> avant import.
        </div>

        {companyKeys.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Société</label>
            <select value={companyKey} onChange={e => setCompanyKey(e.target.value)} style={inputSt}>
              {companyKeys.map(k => <option key={k} value={k}>{companyNames[k] || k}</option>)}
            </select>
          </div>
        )}

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          style={{
            border: '2px dashed rgba(20,184,166,0.35)', borderRadius: 10, padding: '32px 24px',
            textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.65)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.35)')}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Glisser-déposer ou cliquer pour choisir</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>.csv · .txt</div>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

        {parseErr && <div style={{ marginTop: 12, color: '#ef4444', fontSize: 12 }}>❌ {parseErr}</div>}
      </div>
    )
  }

  // ── Étape 2 : prévisualisation et affectation ─────────────────────────────
  const totalHT  = selectedRows.reduce((s, r) => s + r.amount_ht,  0)
  const totalTTC = selectedRows.reduce((s, r) => s + r.amount_ttc, 0)

  return (
    <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24, overflow: 'hidden' }}>
      {/* En-tête */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#14b8a6' }}>📄 {fileName}</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
            {rows.length} ligne{rows.length > 1 ? 's' : ''} détectée{rows.length > 1 ? 's' : ''} · {selectedRows.length} sélectionnée{selectedRows.length > 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => { setStep('idle'); setRows([]); setFileName('') }}
          style={{ ...inputSt, color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>
          ← Changer de fichier
        </button>
      </div>

      {/* Barre d'affectation globale */}
      <div style={{ padding: '12px 20px', background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', whiteSpace: 'nowrap' }}>⚡ Affectation globale</span>
        <select value={gCat} onChange={e => setGCat(e.target.value as ManualEntry['category'])} style={{ ...inputSt, fontSize: 11 }}>
          {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
        </select>
        <div style={{ flex: 1, minWidth: 180 }}>
          <SubCombo category={gCat} value={gSub} onChange={setGSub} />
        </div>
        <button onClick={applyGlobal}
          style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', whiteSpace: 'nowrap' }}>
          Appliquer à toutes
        </button>
        <button onClick={applyGlobalCatOnly}
          style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          Catégorie seule
        </button>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '8px 10px', textAlign: 'center', width: 32 }}>
                <input type="checkbox" checked={allChecked}
                  onChange={e => setRows(rs => rs.map(r => ({ ...r, selected: e.target.checked })))} />
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8', whiteSpace: 'nowrap' }}>Date</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8' }}>Tiers</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8' }}>Libellé</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>HT €</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>TTC €</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8', minWidth: 100 }}>Catégorie</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8', minWidth: 180 }}>Sous-catégorie</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const warn = r.selected && (!r.date || r.amount_ht === 0)
              return (
                <tr key={r.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: r.selected ? 1 : 0.35, background: warn ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <input type="checkbox" checked={r.selected}
                      onChange={e => updateRow(r.id, { selected: e.target.checked })} />
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <input type="date" value={r.date}
                      onChange={e => updateRow(r.id, { date: e.target.value })}
                      style={{ ...inputSt, padding: '3px 6px', fontSize: 11, width: 120 }} />
                  </td>
                  <td style={{ padding: '6px 8px', maxWidth: 120 }}>
                    <input type="text" value={r.counterpart}
                      onChange={e => updateRow(r.id, { counterpart: e.target.value })}
                      style={{ ...inputSt, padding: '3px 6px', fontSize: 11, width: '100%', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 8px', maxWidth: 160 }}>
                    <input type="text" value={r.label}
                      onChange={e => updateRow(r.id, { label: e.target.value })}
                      style={{ ...inputSt, padding: '3px 6px', fontSize: 11, width: '100%', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#34d399', whiteSpace: 'nowrap' }}>
                    {fmt(r.amount_ht)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {fmt(r.amount_ttc)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select value={r.category}
                      onChange={e => updateRow(r.id, { category: e.target.value as ManualEntry['category'], subcategory: '' })}
                      style={{ ...inputSt, padding: '3px 6px', fontSize: 11 }}>
                      {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <SubCombo
                      category={r.category}
                      value={r.subcategory}
                      onChange={v => updateRow(r.id, { subcategory: v })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pied : totaux + bouton import */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, fontSize: 11, color: '#94a3b8' }}>
          <span style={{ marginRight: 16 }}><strong style={{ color: '#f1f5f9' }}>{selectedRows.length}</strong> ligne{selectedRows.length > 1 ? 's' : ''} sélectionnée{selectedRows.length > 1 ? 's' : ''}</span>
          <span style={{ marginRight: 16 }}>Total HT : <strong style={{ color: '#34d399', fontFamily: 'monospace' }}>{fmt(totalHT)} €</strong></span>
          <span>Total TTC : <strong style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{fmt(totalTTC)} €</strong></span>
        </div>
        {someInvalid && (
          <div style={{ fontSize: 11, color: '#f59e0b' }}>⚠ Certaines lignes ont une date ou un montant manquant</div>
        )}
        <button onClick={handleImport} disabled={saving || selectedRows.length === 0}
          style={{
            padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: selectedRows.length > 0 ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${selectedRows.length > 0 ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: selectedRows.length > 0 ? '#14b8a6' : '#475569',
            cursor: saving || selectedRows.length === 0 ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>
          {saving ? 'Import en cours…' : `📥 Importer ${selectedRows.length} ligne${selectedRows.length > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
