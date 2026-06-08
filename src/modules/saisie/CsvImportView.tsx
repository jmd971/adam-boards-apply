import { useState, useMemo, useRef } from 'react'
import type { ManualEntry } from '@/types'
import { CATEGORIES, SUB_ALIASES, normSub } from '@/lib/categories'
// normSub utilisé uniquement dans SubCombo (recherche sous-catégorie)

// ─── Types ────────────────────────────────────────────────────────────────────
export type CsvRow = {
  id: number
  selected: boolean
  date: string
  invoice_number: string
  label: string
  counterpart: string
  amount_ht: number
  amount_ttc: number
  tva_amount: number
  tva_rate: string
  payment_date: string
  payment_mode: string
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
  if (v.includes('vente') || v.includes('produit') || v.includes('recette') || v.includes('facture')) return 'Vente'
  if (v.includes('achat') || v.includes('fournisseur')) return 'Achat'
  if (v.includes('immo')) return 'Immobilisation'
  return 'Depense'
}

// Normalisation robuste des noms de colonnes :
// - NFD decompose les caractères accentués en base + diacritique combinant
// - ̀-ͯ supprime TOUS les diacritiques (range Unicode explicite, fiable en bundle)
// - on ne garde que a-z, 0-9 et espace ; underscore = espace
function normCol(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // supprime accents (é→e, è→e, ê→e, ç→c…)
    .replace(/[^a-z0-9\s]/g, ' ')      // retire ponctuation, symboles restants
    .replace(/\s+/g, ' ')              // espaces multiples → un seul
    .trim()
}

// Mappe mode de règlement FR → valeur interne
function mapPayMode(raw: string): string {
  const v = normCol(raw)
  if (v.includes('virement')) return 'virement'
  if (v.includes('prelevement')) return 'prelevement'
  if (v.includes('cheque')) return 'cheque'
  if (v.includes('cb') || v.includes('carte')) return 'cb'
  if (v.includes('espece')) return 'especes'
  return 'virement'
}

// ─── Mapping de colonnes ──────────────────────────────────────────────────────
export type FieldKey =
  | 'date' | 'invoice_number' | 'counterpart' | 'label'
  | 'amount_ht' | 'amount_ttc' | 'tva_amount' | 'tva_rate'
  | 'payment_date' | 'payment_mode' | 'nature' | 'subcategory'

export type Mapping = Record<FieldKey, number>   // index de colonne, -1 = non mappé

export type CsvStructure = {
  rawHeaders: string[]   // en-têtes d'origine (affichage)
  headers: string[]      // en-têtes normalisés (détection)
  dataRows: string[][]   // lignes de données (totaux/vides filtrés)
}

// Métadonnées des champs cibles + listes de candidats pour l'auto-détection
export const FIELDS: { key: FieldKey; label: string; required?: boolean; candidates: string[] }[] = [
  { key: 'date',           label: 'Date',                 required: true,  candidates: ['date'] },
  { key: 'invoice_number', label: 'N° Facture',                            candidates: ['numero', 'num_facture', 'numero_facture', 'invoice_number', 'ref_facture', 'reference', 'ref'] },
  { key: 'counterpart',    label: 'Tiers / Client',                        candidates: ['societe', 'denomination', 'contrepartie', 'counterpart', 'tiers', 'fournisseur', 'client', 'nom', 'raison'] },
  { key: 'label',          label: 'Libellé',                               candidates: ['libelle', 'label', 'description', 'designation', 'objet', 'intitule'] },
  { key: 'amount_ht',      label: 'Montant HT',           required: true,  candidates: ['montant ht', 'montant_ht', 'amount_ht', 'prix_ht', 'net_ht', 'base_ht', 'debit', 'sortie', 'decaissement', 'montant', 'amount', 'valeur'] },
  { key: 'amount_ttc',     label: 'Montant TTC',                           candidates: ['montant ttc', 'montant_ttc', 'amount_ttc', 'prix_ttc', 'total_ttc'] },
  { key: 'tva_amount',     label: 'Montant TVA',                           candidates: ['montant tva', 'montant_tva', 'tva_amount', 'tva', 'taxe', 'tax_amount'] },
  { key: 'tva_rate',       label: 'Taux TVA',                              candidates: ['taux_tva', 'tva_rate', 'taux', 'tax_rate'] },
  { key: 'payment_date',   label: 'Date encaissement',                     candidates: ['encaissee le', 'encaissee_le', 'date_paiement', 'payment_date', 'date_reglement', 'paid_date'] },
  { key: 'payment_mode',   label: 'Mode de règlement',                     candidates: ['mode de reglement', 'mode_reglement', 'mode_paiement', 'payment_mode', 'reglement', 'moyen_paiement'] },
  { key: 'nature',         label: 'Nature (Vente/Achat)',                  candidates: ['nature', 'type_facture', 'type_document', 'categorie', 'category', 'type'] },
  { key: 'subcategory',    label: 'Sous-catégorie',                        candidates: ['sous_categorie', 'subcategory', 'sous_cat', 'compte', 'poste'] },
]

// Étape 1 : extraire en-têtes + lignes de données (filtre totaux et lignes vides)
export function parseCSVStructure(text: string): CsvStructure {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rawHeaders: [], headers: [], dataRows: [] }
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const rawHeaders = splitCSV(lines[0], sep)
  const headers = rawHeaders.map(h => normCol(h))

  const dataRows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSV(lines[i], sep)
    if (cols.every(c => !c)) continue
    // Ignorer les lignes de total/résumé (ex : "Total Euro;;;;;41717,15;...")
    const firstVal = normCol(cols[0]?.trim() ?? '')
    if (firstVal.startsWith('total') || firstVal.startsWith('sous total')) continue
    dataRows.push(cols)
  }
  return { rawHeaders, headers, dataRows }
}

// Étape 2 : auto-détecter le mapping à partir des en-têtes normalisés
export function detectMapping(headers: string[]): Mapping {
  const find = (candidates: string[]): number => {
    for (const cand of candidates) {
      const nc = normCol(cand)
      const i = headers.findIndex(h => h === nc || h.includes(nc) || nc.includes(h))
      if (i >= 0) return i
    }
    return -1
  }
  const m = {} as Mapping
  const used = new Set<number>()
  for (const f of FIELDS) {
    let idx = find(f.candidates)
    // éviter qu'une même colonne soit affectée à deux champs distincts
    if (idx >= 0 && used.has(idx)) idx = -1
    if (idx >= 0) used.add(idx)
    m[f.key] = idx
  }
  return m
}

// Étape 3 : appliquer le mapping aux lignes → CsvRow[]
export function applyMapping(structure: CsvStructure, m: Mapping): CsvRow[] {
  const rows: CsvRow[] = []
  structure.dataRows.forEach((cols, i) => {
    const get = (idx: number) => idx >= 0 ? cols[idx]?.trim() ?? '' : ''

    const ht  = Math.abs(parseMontant(get(m.amount_ht)))
    let ttc = m.amount_ttc >= 0 ? Math.abs(parseMontant(get(m.amount_ttc))) : 0
    if (!ttc) ttc = ht

    // TVA : colonne dédiée ou calcul HT/TTC
    let tvaAmt = 0, tvaRate = ''
    if (m.tva_amount >= 0) tvaAmt = Math.abs(parseMontant(get(m.tva_amount)))
    else if (ht > 0 && ttc > ht) tvaAmt = Math.round((ttc - ht) * 100) / 100
    if (m.tva_rate >= 0) tvaRate = get(m.tva_rate).replace('%', '').trim()
    else if (ht > 0 && ttc > ht) tvaRate = (((ttc - ht) / ht) * 100).toFixed(2)

    const rawNature = get(m.nature)
    const cat = rawNature ? detectCat(rawNature) : 'Depense'

    const tiers = get(m.counterpart)
    const labelRaw = get(m.label)
    const label = labelRaw && labelRaw !== tiers ? labelRaw : tiers

    rows.push({
      id: i,
      selected: true,
      date:           parseDate(get(m.date)),
      invoice_number: get(m.invoice_number),
      label,
      counterpart:    tiers,
      amount_ht:      ht,
      amount_ttc:     ttc,
      tva_amount:     tvaAmt,
      tva_rate:       tvaRate,
      payment_date:   parseDate(get(m.payment_date)),
      payment_mode:   get(m.payment_mode) ? mapPayMode(get(m.payment_mode)) : 'virement',
      category:       cat,
      subcategory:    get(m.subcategory),
    })
  })
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
  const [step,       setStep]       = useState<'idle' | 'mapping' | 'preview'>('idle')
  const [fileName,   setFileName]   = useState('')
  const [parseErr,   setParseErr]   = useState<string | null>(null)
  const [companyKey, setCompanyKey] = useState(defaultCompanyKey)
  // Structure du fichier + mapping de colonnes
  const [structure,  setStructure]  = useState<CsvStructure | null>(null)
  const [mapping,    setMapping]    = useState<Mapping | null>(null)
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
      // Détection d'encodage : si le fichier est ISO-8859-1/Latin-1 (export Excel FR),
      // file.text() (UTF-8 par défaut) produit du mojibake : "é" → "Ã©", "è" → "Ã¨", etc.
      // On re-décode avec iso-8859-1 dans ce cas.
      const buffer = await file.arrayBuffer()
      let text = new TextDecoder('utf-8').decode(buffer)
      if (/Ã[\x80-\xBF]|â€|Ã‰|Ã€/.test(text)) {
        text = new TextDecoder('iso-8859-1').decode(buffer)
      }
      const struct = parseCSVStructure(text)
      if (struct.dataRows.length === 0) { setParseErr('Fichier vide ou format non reconnu.'); return }
      setStructure(struct)
      setMapping(detectMapping(struct.headers))
      setStep('mapping')
    } catch (e: any) {
      setParseErr(e?.message ?? 'Erreur de lecture')
    }
  }

  // ── Valider le mapping → prévisualisation ──────────────────────────────────
  const confirmMapping = () => {
    if (!structure || !mapping) return
    setRows(applyMapping(structure, mapping))
    setStep('preview')
  }

  const setFieldMap = (key: FieldKey, idx: number) => {
    setMapping(m => m ? { ...m, [key]: idx } : m)
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
    setStructure(null)
    setMapping(null)
    setStep('idle')
    setFileName('')
  }

  const resetAll = () => { setStep('idle'); setRows([]); setStructure(null); setMapping(null); setFileName('') }

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

  // ── Étape 2 : mapping des colonnes ─────────────────────────────────────────
  if (step === 'mapping' && structure && mapping) {
    // Valeur d'exemple (1re ligne de données) pour aider à identifier une colonne
    const sample = (idx: number) => idx >= 0 ? (structure.dataRows[0]?.[idx]?.trim() ?? '') : ''
    const usedCols = new Set(Object.values(mapping).filter(i => i >= 0))
    const missingRequired = FIELDS.filter(f => f.required && mapping[f.key] < 0)

    return (
      <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#14b8a6' }}>🔗 Correspondance des colonnes — 📄 {fileName}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
              {structure.dataRows.length} ligne{structure.dataRows.length > 1 ? 's' : ''} · {structure.rawHeaders.length} colonne{structure.rawHeaders.length > 1 ? 's' : ''} détectée{structure.rawHeaders.length > 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={resetAll}
            style={{ ...inputSt, color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>
            ← Changer de fichier
          </button>
        </div>

        <div style={{ padding: '14px 20px', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          Vérifiez la correspondance entre les colonnes de votre fichier et les champs AdamBoards.
          Les colonnes ont été détectées automatiquement — corrigez si nécessaire. <strong style={{ color: '#14b8a6' }}>Date</strong> et <strong style={{ color: '#14b8a6' }}>Montant HT</strong> sont obligatoires.
        </div>

        {/* Grille de mapping */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {FIELDS.map(f => {
            const idx = mapping[f.key]
            const isMissing = f.required && idx < 0
            return (
              <div key={f.key} style={{
                padding: '10px 12px', borderRadius: 9,
                background: isMissing ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isMissing ? 'rgba(239,68,68,0.3)' : idx >= 0 ? 'rgba(20,184,166,0.25)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isMissing ? '#f87171' : '#e2e8f0', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {idx >= 0 ? <span style={{ color: '#14b8a6' }}>✓</span> : <span style={{ color: '#475569' }}>○</span>}
                  {f.label}
                  {f.required && <span style={{ color: '#f87171', fontSize: 13 }}>*</span>}
                </div>
                <select
                  value={idx}
                  onChange={e => setFieldMap(f.key, parseInt(e.target.value))}
                  style={{ ...inputSt, fontSize: 11, width: '100%', padding: '5px 8px', boxSizing: 'border-box' }}>
                  <option value={-1}>— Aucune —</option>
                  {structure.rawHeaders.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Colonne ${i + 1}`}{usedCols.has(i) && i !== idx ? '  (déjà utilisée)' : ''}
                    </option>
                  ))}
                </select>
                {idx >= 0 && sample(idx) && (
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 5, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ex : {sample(idx)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pied : validation */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 11, color: missingRequired.length ? '#f59e0b' : '#475569' }}>
            {missingRequired.length > 0
              ? `⚠ Champ${missingRequired.length > 1 ? 's' : ''} obligatoire${missingRequired.length > 1 ? 's' : ''} non mappé${missingRequired.length > 1 ? 's' : ''} : ${missingRequired.map(f => f.label).join(', ')}`
              : '✓ Tous les champs obligatoires sont mappés'}
          </div>
          <button onClick={confirmMapping} disabled={missingRequired.length > 0}
            style={{
              padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: missingRequired.length === 0 ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${missingRequired.length === 0 ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: missingRequired.length === 0 ? '#14b8a6' : '#475569',
              cursor: missingRequired.length === 0 ? 'pointer' : 'not-allowed',
            }}>
            Prévisualiser →
          </button>
        </div>
      </div>
    )
  }

  // ── Étape 3 : prévisualisation et affectation ─────────────────────────────
  const totalHT  = selectedRows.reduce((s, r) => s + r.amount_ht,  0)
  const totalTVA = selectedRows.reduce((s, r) => s + r.tva_amount, 0)
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('mapping')}
            style={{ ...inputSt, color: '#93c5fd', cursor: 'pointer', fontSize: 11, borderColor: 'rgba(59,130,246,0.3)' }}>
            ← Colonnes
          </button>
          <button onClick={resetAll}
            style={{ ...inputSt, color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>
            Changer de fichier
          </button>
        </div>
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
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8', whiteSpace: 'nowrap' }}>N° Facture</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8' }}>Tiers</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: '#94a3b8' }}>Libellé</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>HT €</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: '#94a3b8', whiteSpace: 'nowrap' }}>TVA €</th>
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
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <input type="text" value={r.invoice_number}
                      onChange={e => updateRow(r.id, { invoice_number: e.target.value })}
                      placeholder="—"
                      style={{ ...inputSt, padding: '3px 6px', fontSize: 11, width: 90, boxSizing: 'border-box' }} />
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
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b', whiteSpace: 'nowrap' }}>
                    {r.tva_amount > 0
                      ? <span title={r.tva_rate ? `${r.tva_rate} %` : ''}>{fmt(r.tva_amount)}</span>
                      : <span style={{ color: '#334155' }}>—</span>}
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
          {totalTVA > 0 && <span style={{ marginRight: 16 }}>TVA : <strong style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{fmt(totalTVA)} €</strong></span>}
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
