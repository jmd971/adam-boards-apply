import { useState, useMemo, useRef } from 'react'
import type { ManualEntry } from '@/types'
import { CATEGORIES, SUB_ALIASES, normSub, extractAcc } from '@/lib/categories'
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

/** Mapping d'import enregistré : correspondance champ → en-tête (normalisé). */
export type SavedCsvMapping = {
  id: string
  company_key: string
  category: ManualEntry['category']
  name: string
  mapping: Partial<Record<FieldKey, string>>
}

interface Props {
  companyKeys: string[]
  defaultCompanyKey: string
  companyNames: Record<string, string>
  onImport: (companyKey: string, rows: CsvRow[]) => Promise<void>
  saving: boolean
  /** Comptes réels par société : FEC N-1/N + historique des saisies (code + libellé). */
  realAccountsByCompany?: Record<string, { code: string; label: string; source: string }[]>
  /** Mappings enregistrés du tenant (toutes sociétés) — filtrés par société en interne. */
  savedMappings?: SavedCsvMapping[]
  /** Enregistre / met à jour un mapping (upsert sur société + catégorie + nom). */
  onSaveMapping?: (input: { company_key: string; category: ManualEntry['category']; name: string; mapping: Partial<Record<FieldKey, string>> }) => Promise<void>
  /** Supprime un mapping enregistré par id. */
  onDeleteMapping?: (id: string) => Promise<void>
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

// Inverse une couche de mojibake : prend une chaîne dont les caractères sont en
// réalité des octets UTF-8 mal décodés (ex : "Ã©") et les ré-interprète en UTF-8 → "é".
function deMojibake(s: string): string {
  try {
    const bytes = Uint8Array.from([...s], c => c.charCodeAt(0) & 0xff)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return s
  }
}

// Décode un fichier CSV en gérant tous les cas d'encodage rencontrés en pratique :
//  1. UTF-8 propre               → décodage direct
//  2. ISO-8859-1 / Latin-1       → UTF-8 strict échoue → fallback latin-1
//  3. UTF-8 double-encodé (mojibake "Ã©", "â‚¬"…) → on inverse 1 à 2 couches
// Les exports de logiciels de facturation FR tombent souvent dans le cas 3.
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  let text: string
  try {
    // UTF-8 strict : lève une exception si les octets ne sont pas de l'UTF-8 valide
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Pas de l'UTF-8 valide → fichier Latin-1
    return new TextDecoder('iso-8859-1').decode(buffer)
  }
  // UTF-8 valide mais possiblement du mojibake double-encodé : "Numéro" → "NumÃ©ro"
  // On inverse jusqu'à 2 couches tant que des marqueurs de mojibake subsistent.
  for (let pass = 0; pass < 2; pass++) {
    if (!/Ã[\x80-\xBF]|â‚¬|â€|Ã©|Ã¨|Ã /.test(text)) break
    const fixed = deMojibake(text)
    if (fixed === text) break
    text = fixed
  }
  return text
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
  // « nom du fournisseur »/« nom du client » AVANT « tiers » : sur un export Axonaut,
  // « tiers » matcherait la colonne « Compte de tiers du fournisseur » (401xxx) au lieu du nom.
  { key: 'counterpart',    label: 'Tiers / Client',                        candidates: ['societe', 'denomination', 'contrepartie', 'counterpart', 'nom du fournisseur', 'nom du client', 'tiers', 'fournisseur', 'client', 'nom', 'raison'] },
  { key: 'label',          label: 'Libellé',                               candidates: ['libelle', 'label', 'description', 'designation', 'objet', 'intitule', 'titre'] },
  { key: 'amount_ht',      label: 'Montant HT',           required: true,  candidates: ['montant ht', 'montant_ht', 'amount_ht', 'prix_ht', 'net_ht', 'base_ht', 'debit', 'sortie', 'decaissement', 'montant', 'amount', 'valeur'] },
  { key: 'amount_ttc',     label: 'Montant TTC',                           candidates: ['montant ttc', 'montant_ttc', 'amount_ttc', 'prix_ttc', 'total_ttc'] },
  { key: 'tva_amount',     label: 'Montant TVA',                           candidates: ['montant tva', 'montant_tva', 'tva_amount', 'tva', 'taxe', 'tax_amount'] },
  { key: 'tva_rate',       label: 'Taux TVA',                              candidates: ['taux_tva', 'tva_rate', 'taux', 'tax_rate'] },
  { key: 'payment_date',   label: 'Date encaissement',                     candidates: ['encaissee le', 'encaissee_le', 'date_paiement', 'date de paiement', 'payment_date', 'date_reglement', 'paid_date'] },
  { key: 'payment_mode',   label: 'Mode de règlement',                     candidates: ['mode de reglement', 'mode_reglement', 'mode_paiement', 'payment_mode', 'reglement', 'moyen_paiement'] },
  { key: 'nature',         label: 'Nature (Vente/Achat)',                  candidates: ['nature', 'type_facture', 'type_document', 'categorie', 'category', 'type'] },
  // « code comptable » AVANT « compte » : la colonne Axonaut « Code comptable du type
  // de la dépense » porte le vrai compte (6233…), pas « Compte de tiers du fournisseur ».
  { key: 'subcategory',    label: 'Sous-catégorie',                        candidates: ['sous_categorie', 'subcategory', 'sous_cat', 'code comptable', 'compte', 'poste'] },
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

// ─── Mappings enregistrés (par nom d'en-tête, robuste au réordonnancement) ────

// Convertit un mapping par index → mapping par en-tête normalisé (pour stockage).
// Seuls les champs réellement mappés (idx >= 0) sont conservés.
export function mappingToHeaders(m: Mapping, headers: string[]): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {}
  for (const f of FIELDS) {
    const idx = m[f.key]
    if (idx >= 0 && headers[idx]) out[f.key] = headers[idx]
  }
  return out
}

// Résout un mapping enregistré (par en-tête) vers des index de colonnes du fichier
// courant. En-tête introuvable → -1. Une colonne n'est jamais affectée deux fois.
export function headersToMapping(saved: Partial<Record<FieldKey, string>>, headers: string[]): Mapping {
  const m = {} as Mapping
  const used = new Set<number>()
  for (const f of FIELDS) {
    const h = saved[f.key]
    let idx = -1
    if (h) idx = headers.findIndex((hh, i) => hh === h && !used.has(i))
    if (idx >= 0) used.add(idx)
    m[f.key] = idx
  }
  return m
}

// Score de correspondance d'un mapping enregistré avec les en-têtes d'un fichier :
// nombre de champs dont l'en-tête stocké existe dans le fichier. -1 si les champs
// obligatoires (date, montant HT) ne sont pas tous résolvables (mapping inapplicable).
export function scoreSavedMapping(saved: Partial<Record<FieldKey, string>>, headers: string[]): number {
  const reqOk = FIELDS.filter(f => f.required).every(f => {
    const h = saved[f.key]
    return !!h && headers.includes(h)
  })
  if (!reqOk) return -1
  let score = 0
  for (const f of FIELDS) {
    const h = saved[f.key]
    if (h && headers.includes(h)) score++
  }
  return score
}

// Étape 3 : appliquer le mapping aux lignes → CsvRow[]
// `defaultCategory` (facultatif) : si fourni (ex : catégorie d'un profil de mapping
// enregistré), force la catégorie de toutes les lignes au lieu de la détecter.
export function applyMapping(structure: CsvStructure, m: Mapping, defaultCategory?: ManualEntry['category']): CsvRow[] {
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
    const cat = defaultCategory ?? (rawNature ? detectCat(rawNature) : 'Depense')

    const tiers = get(m.counterpart)
    const labelRaw = get(m.label)
    const label = labelRaw && labelRaw !== tiers ? labelRaw : tiers

    const date = parseDate(get(m.date))
    rows.push({
      id: i,
      // Lignes sans date ou à 0 € : décochées par défaut — elles n'apportent rien
      // au P&L et faisaient échouer l'insert du lot entier. Re-cochables à la main.
      selected: !!date && ht > 0,
      date,
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
function SubCombo({ category, value, onChange, realAccounts = [] }: {
  category: ManualEntry['category']
  value: string
  onChange: (v: string) => void
  realAccounts?: { code: string; label: string; source: string }[]
}) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const catSubs = CATEGORIES.find(c => c.cat === category)?.subs ?? []
  // Classe comptable selon la catégorie (pour filtrer les comptes réels)
  const cls = category === 'Vente' ? '7' : category === 'Immobilisation' ? '2' : '6'

  type Opt = { value: string; code: string; label: string; source: string }
  const options = useMemo(() => {
    const q = normSub(search.trim())
    // 1. Comptes réels (FEC N-1/N + historique), formatés « LIBELLÉ (CODE) » pour
    //    que extractAcc récupère le code exact à l'enregistrement.
    const reels: Opt[] = realAccounts
      .filter(a => a.code.startsWith(cls))
      .map(a => ({ value: `${a.label} (${a.code})`, code: a.code, label: a.label, source: a.source }))
    // 2. Sous-catégories prédéfinies (liste type)
    const predef: Opt[] = catSubs.map(sub => ({ value: sub, code: extractAcc(sub, ''), label: sub, source: 'liste' }))
    let all = [...reels, ...predef]
    if (q) {
      all = all.filter(o =>
        normSub(o.label).includes(q) || o.code.includes(search.trim()) ||
        (SUB_ALIASES[o.value] ?? []).some(a => normSub(a).includes(q) || q.includes(normSub(a)))
      )
    }
    return all
  }, [search, catSubs, realAccounts, cls])

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '5px 22px 5px 7px', borderRadius: 6, fontSize: 11,
    background: 'var(--bg-2)', border: '1px solid var(--border-1)',
    color: value ? '#1e88c7' : 'var(--text-2)', outline: 'none', boxSizing: 'border-box',
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
          style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--text-2)', cursor: 'pointer', pointerEvents: value ? 'auto' : 'none' }}
          onMouseDown={e => { e.preventDefault(); onChange(''); setSearch('') }}
        >{value ? '✕' : '▾'}</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, minWidth: 280, zIndex: 300,
          background: 'var(--bg-1)', border: '1px solid var(--border-1)',
          borderRadius: 7, maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {options.map((o, i) => (
            <div key={o.value + i}
              onMouseDown={() => { onChange(o.value); setSearch(''); setOpen(false) }}
              style={{
                padding: '6px 10px', fontSize: 11, cursor: 'pointer',
                color: o.value === value ? '#1e88c7' : 'var(--text-1)',
                background: o.value === value ? 'rgba(59,130,246,0.18)' : 'transparent',
                borderBottom: '1px solid var(--border-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'var(--bg-2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = o.value === value ? 'rgba(59,130,246,0.18)' : 'transparent' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.code && <span style={{ fontFamily: 'monospace', color: 'var(--text-3)', marginRight: 6 }}>{o.code}</span>}
                {o.label}
              </span>
              {o.source !== 'liste' && (
                <span style={{ flexShrink: 0, fontSize: 8.5, color: o.source === 'liste' ? 'var(--text-3)' : '#34d399', background: 'rgba(52,211,153,0.12)', padding: '1px 5px', borderRadius: 8 }}>{o.source}</span>
              )}
            </div>
          ))}
          {/* Ajout manuel : utiliser le texte saisi tel quel s'il ne correspond à aucun compte */}
          {search.trim() && !options.some(o => normSub(o.value) === normSub(search)) && (
            <div
              onMouseDown={() => { onChange(search.trim()); setSearch(''); setOpen(false) }}
              style={{ padding: '7px 10px', fontSize: 11, cursor: 'pointer', color: '#a78bfa', borderTop: '1px solid var(--border-1)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              ➕ Ajouter le compte : « {search.trim()} »
            </div>
          )}
          {options.length === 0 && !search.trim() && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic' }}>Tapez pour chercher un compte…</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export function CsvImportView({ companyKeys, defaultCompanyKey, companyNames, onImport, saving, realAccountsByCompany = {}, savedMappings = [], onSaveMapping, onDeleteMapping }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows,       setRows]       = useState<CsvRow[]>([])
  const [step,       setStep]       = useState<'idle' | 'mapping' | 'preview'>('idle')
  const [fileName,   setFileName]   = useState('')
  const [parseErr,   setParseErr]   = useState<string | null>(null)
  const [companyKey, setCompanyKey] = useState(defaultCompanyKey)
  // Structure du fichier + mapping de colonnes
  const [structure,  setStructure]  = useState<CsvStructure | null>(null)
  const [mapping,    setMapping]    = useState<Mapping | null>(null)
  // Profils de mapping enregistrés
  const [appliedProfileId, setAppliedProfileId] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveCat,  setSaveCat]  = useState<ManualEntry['category']>('Vente')
  const [profileMsg,  setProfileMsg]  = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  // Affectation globale
  const [gCat, setGCat] = useState<ManualEntry['category']>('Depense')
  const [gSub, setGSub] = useState('')

  // Mappings enregistrés pour la société sélectionnée (les plus récents d'abord)
  const companyMappings = savedMappings.filter(s => s.company_key === companyKey)

  const selectedRows = rows.filter(r => r.selected)
  const allChecked   = rows.length > 0 && rows.every(r => r.selected)
  const someInvalid  = selectedRows.some(r => !r.date || r.amount_ht === 0)

  // ── Chargement du fichier ──────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setParseErr(null)
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const text = decodeCsvBuffer(buffer)
      const struct = parseCSVStructure(text)
      if (struct.dataRows.length === 0) { setParseErr('Fichier vide ou format non reconnu.'); return }
      setStructure(struct)
      // Auto-application : on choisit le profil enregistré (de cette société) dont
      // les colonnes correspondent le mieux au fichier ; sinon auto-détection.
      let best: SavedCsvMapping | null = null, bestScore = 0
      for (const s of companyMappings) {
        const sc = scoreSavedMapping(s.mapping, struct.headers)
        if (sc > bestScore) { bestScore = sc; best = s }
      }
      if (best) {
        setMapping(headersToMapping(best.mapping, struct.headers))
        setAppliedProfileId(best.id)
        setSaveName(best.name)
        setSaveCat(best.category)
        setProfileMsg(`✓ Mapping « ${best.name} » (${best.category}) appliqué automatiquement`)
      } else {
        setMapping(detectMapping(struct.headers))
        setAppliedProfileId(null)
        setProfileMsg(null)
      }
      setStep('mapping')
    } catch (e: any) {
      setParseErr(e?.message ?? 'Erreur de lecture')
    }
  }

  // ── Valider le mapping → prévisualisation ──────────────────────────────────
  const confirmMapping = () => {
    if (!structure || !mapping) return
    // Si un profil enregistré est appliqué, sa catégorie devient la catégorie par
    // défaut des lignes prévisualisées (« sauvegardable par catégorie »).
    const prof = appliedProfileId ? companyMappings.find(s => s.id === appliedProfileId) : null
    setRows(applyMapping(structure, mapping, prof?.category))
    if (prof) setGCat(prof.category)
    setStep('preview')
  }

  const setFieldMap = (key: FieldKey, idx: number) => {
    setMapping(m => m ? { ...m, [key]: idx } : m)
    // On conserve le lien au profil (et donc sa catégorie) même après un ajustement
    // manuel des colonnes ; ré-enregistrer sous le même nom écrase le profil.
  }

  // ── Profils de mapping ─────────────────────────────────────────────────────
  // Sélection dans le menu déroulant : '' = auto-détection, sinon id de profil
  const selectProfile = (id: string) => {
    if (!structure) return
    if (!id) {
      setMapping(detectMapping(structure.headers))
      setAppliedProfileId(null)
      setProfileMsg(null)
      return
    }
    const prof = companyMappings.find(s => s.id === id)
    if (!prof) return
    setMapping(headersToMapping(prof.mapping, structure.headers))
    setAppliedProfileId(prof.id)
    setSaveName(prof.name)
    setSaveCat(prof.category)
    setProfileMsg(`✓ Mapping « ${prof.name} » (${prof.category}) chargé`)
  }

  const saveProfile = async () => {
    if (!onSaveMapping || !structure || !mapping) return
    const name = saveName.trim()
    if (!name) { setProfileMsg('⚠ Donnez un nom au mapping avant d’enregistrer'); return }
    setProfileBusy(true)
    setProfileMsg(null)
    try {
      await onSaveMapping({
        company_key: companyKey,
        category:    saveCat,
        name,
        mapping:     mappingToHeaders(mapping, structure.headers),
      })
      setProfileMsg(`💾 Mapping « ${name} » (${saveCat}) enregistré pour ${companyNames[companyKey] || companyKey}`)
    } catch (e: any) {
      setProfileMsg('❌ ' + (e?.message ?? 'Échec de l’enregistrement'))
    } finally {
      setProfileBusy(false)
    }
  }

  const deleteProfile = async (id: string, name: string) => {
    if (!onDeleteMapping) return
    setProfileBusy(true)
    try {
      await onDeleteMapping(id)
      if (appliedProfileId === id) setAppliedProfileId(null)
      setProfileMsg(`🗑 Mapping « ${name} » supprimé`)
    } catch (e: any) {
      setProfileMsg('❌ ' + (e?.message ?? 'Échec de la suppression'))
    } finally {
      setProfileBusy(false)
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
    setStructure(null)
    setMapping(null)
    setStep('idle')
    setFileName('')
  }

  const resetAll = () => { setStep('idle'); setRows([]); setStructure(null); setMapping(null); setFileName(''); setAppliedProfileId(null); setProfileMsg(null) }

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const inputSt: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 7, fontSize: 12,
    background: 'var(--bg-2)', border: '1px solid var(--border-1)',
    color: 'var(--text-0)', outline: 'none',
  }

  // ── Étape 1 : sélection fichier ────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div style={{ background: 'var(--bg-1)', borderRadius: 12, padding: 28, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#14b8a6', marginBottom: 6 }}>Import fichier ventes / achats</div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
          Accepte les fichiers <strong style={{ color: 'var(--text-2)' }}>CSV, TXT</strong> (séparateurs , ; ou tabulation).<br />
          Colonnes détectées automatiquement : date, libellé, tiers, montant HT, montant TTC, catégorie.<br />
          Export Excel → <em>Fichier → Enregistrer sous → CSV</em> avant import.
        </div>

        {companyKeys.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Société</label>
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
          <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Glisser-déposer ou cliquer pour choisir</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>.csv · .txt</div>
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
      <div style={{ background: 'var(--bg-1)', borderRadius: 12, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#14b8a6' }}>🔗 Correspondance des colonnes — 📄 {fileName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
              {structure.dataRows.length} ligne{structure.dataRows.length > 1 ? 's' : ''} · {structure.rawHeaders.length} colonne{structure.rawHeaders.length > 1 ? 's' : ''} détectée{structure.rawHeaders.length > 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={resetAll}
            style={{ ...inputSt, color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>
            ← Changer de fichier
          </button>
        </div>

        <div style={{ padding: '14px 20px', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6, borderBottom: '1px solid var(--border-1)' }}>
          Vérifiez la correspondance entre les colonnes de votre fichier et les champs AdamBoards.
          Les colonnes ont été détectées automatiquement — corrigez si nécessaire. <strong style={{ color: '#14b8a6' }}>Date</strong> et <strong style={{ color: '#14b8a6' }}>Montant HT</strong> sont obligatoires.
        </div>

        {/* Profils de mapping enregistrés (par société + catégorie) */}
        {onSaveMapping && (
          <div style={{ padding: '12px 20px', background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', whiteSpace: 'nowrap' }}>🗂 Profil de mapping</span>
              {companyMappings.length > 0 && (
                <select value={appliedProfileId ?? ''} onChange={e => selectProfile(e.target.value)} style={{ ...inputSt, fontSize: 11 }}>
                  <option value="">🔍 Auto-détection</option>
                  {companyMappings.map(p => <option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}
                </select>
              )}
              <div style={{ flex: 1, minWidth: 8 }} />
              <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Nom du profil…"
                style={{ ...inputSt, fontSize: 11, width: 150, padding: '5px 8px' }} />
              <select value={saveCat} onChange={e => setSaveCat(e.target.value as ManualEntry['category'])} style={{ ...inputSt, fontSize: 11, padding: '5px 8px' }}>
                {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
              </select>
              <button onClick={saveProfile} disabled={profileBusy || missingRequired.length > 0 || !saveName.trim()}
                title={missingRequired.length > 0 ? 'Mappez d’abord les champs obligatoires' : ''}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  background: (profileBusy || missingRequired.length > 0 || !saveName.trim()) ? 'var(--bg-2)' : 'rgba(139,92,246,0.2)',
                  border: `1px solid ${(profileBusy || missingRequired.length > 0 || !saveName.trim()) ? 'var(--bg-2)' : 'rgba(139,92,246,0.45)'}`,
                  color: (profileBusy || missingRequired.length > 0 || !saveName.trim()) ? 'var(--text-2)' : '#c4b5fd',
                  cursor: (profileBusy || missingRequired.length > 0 || !saveName.trim()) ? 'not-allowed' : 'pointer',
                }}>
                💾 Enregistrer
              </button>
            </div>

            {companyMappings.length > 0 && onDeleteMapping && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {companyMappings.map(p => (
                  <span key={p.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-1)',
                    background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 20, padding: '3px 6px 3px 10px',
                  }}>
                    {p.name} <span style={{ color: 'var(--text-3)' }}>· {p.category}</span>
                    <span onClick={() => !profileBusy && deleteProfile(p.id, p.name)} title="Supprimer ce profil"
                      style={{ cursor: profileBusy ? 'default' : 'pointer', color: '#f87171', fontSize: 11, lineHeight: 1, padding: '0 2px' }}>✕</span>
                  </span>
                ))}
              </div>
            )}

            {profileMsg && (
              <div style={{ marginTop: 8, fontSize: 11, color: (profileMsg.startsWith('❌') || profileMsg.startsWith('⚠')) ? '#f59e0b' : '#a78bfa' }}>{profileMsg}</div>
            )}
            <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              Enregistrez cette correspondance pour la réappliquer automatiquement aux prochains imports de <strong style={{ color: 'var(--text-1)' }}>{companyNames[companyKey] || companyKey}</strong>. Le mapping est reconnu par le nom des colonnes du fichier.
            </div>
          </div>
        )}

        {/* Grille de mapping */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {FIELDS.map(f => {
            const idx = mapping[f.key]
            const isMissing = f.required && idx < 0
            return (
              <div key={f.key} style={{
                padding: '10px 12px', borderRadius: 9,
                background: isMissing ? 'rgba(239,68,68,0.06)' : 'rgba(20,30,60,0.03)',
                border: `1px solid ${isMissing ? 'rgba(239,68,68,0.3)' : idx >= 0 ? 'rgba(20,184,166,0.25)' : 'var(--bg-2)'}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isMissing ? '#f87171' : 'var(--text-1)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {idx >= 0 ? <span style={{ color: '#14b8a6' }}>✓</span> : <span style={{ color: 'var(--text-2)' }}>○</span>}
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
                  <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 5, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ex : {sample(idx)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pied : validation */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 11, color: missingRequired.length ? '#f59e0b' : 'var(--text-2)' }}>
            {missingRequired.length > 0
              ? `⚠ Champ${missingRequired.length > 1 ? 's' : ''} obligatoire${missingRequired.length > 1 ? 's' : ''} non mappé${missingRequired.length > 1 ? 's' : ''} : ${missingRequired.map(f => f.label).join(', ')}`
              : '✓ Tous les champs obligatoires sont mappés'}
          </div>
          <button onClick={confirmMapping} disabled={missingRequired.length > 0}
            style={{
              padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: missingRequired.length === 0 ? 'rgba(20,184,166,0.2)' : 'var(--bg-2)',
              border: `1px solid ${missingRequired.length === 0 ? 'rgba(20,184,166,0.4)' : 'var(--bg-2)'}`,
              color: missingRequired.length === 0 ? '#14b8a6' : 'var(--text-2)',
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
    <div style={{ background: 'var(--bg-1)', borderRadius: 12, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24, overflow: 'hidden' }}>
      {/* En-tête */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#14b8a6' }}>📄 {fileName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
            {rows.length} ligne{rows.length > 1 ? 's' : ''} détectée{rows.length > 1 ? 's' : ''} · {selectedRows.length} sélectionnée{selectedRows.length > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setStep('mapping')}
            style={{ ...inputSt, color: '#1e88c7', cursor: 'pointer', fontSize: 11, borderColor: 'rgba(59,130,246,0.3)' }}>
            ← Colonnes
          </button>
          <button onClick={resetAll}
            style={{ ...inputSt, color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}>
            Changer de fichier
          </button>
        </div>
      </div>

      {/* Barre d'affectation globale */}
      <div style={{ padding: '12px 20px', background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e88c7', whiteSpace: 'nowrap' }}>⚡ Affectation globale</span>
        <select value={gCat} onChange={e => setGCat(e.target.value as ManualEntry['category'])} style={{ ...inputSt, fontSize: 11 }}>
          {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
        </select>
        <div style={{ flex: 1, minWidth: 180 }}>
          <SubCombo category={gCat} value={gSub} onChange={setGSub} realAccounts={realAccountsByCompany[companyKey] ?? []} />
        </div>
        <button onClick={applyGlobal}
          style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#1e88c7', whiteSpace: 'nowrap' }}>
          Appliquer à toutes
        </button>
        <button onClick={applyGlobalCatOnly}
          style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: 'var(--bg-2)', border: '1px solid var(--border-1)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          Catégorie seule
        </button>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--bg-2)', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '8px 10px', textAlign: 'center', width: 32 }}>
                <input type="checkbox" checked={allChecked}
                  onChange={e => setRows(rs => rs.map(r => ({ ...r, selected: e.target.checked })))} />
              </th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>Date</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>N° Facture</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: 'var(--text-2)' }}>Tiers</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: 'var(--text-2)' }}>Libellé</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>HT €</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>TVA €</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>TTC €</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: 'var(--text-2)', minWidth: 100 }}>Catégorie</th>
              <th style={{ padding: '8px 8px', textAlign: 'left', color: 'var(--text-2)', minWidth: 180 }}>Sous-catégorie</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const warn = r.selected && (!r.date || r.amount_ht === 0)
              return (
                <tr key={r.id}
                  style={{ borderBottom: '1px solid var(--border-1)', opacity: r.selected ? 1 : 0.35, background: warn ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
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
                      : <span style={{ color: 'var(--text-1)' }}>—</span>}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
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
                      realAccounts={realAccountsByCompany[companyKey] ?? []}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pied : totaux + bouton import */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--text-2)' }}>
          <span style={{ marginRight: 16 }}><strong style={{ color: 'var(--text-0)' }}>{selectedRows.length}</strong> ligne{selectedRows.length > 1 ? 's' : ''} sélectionnée{selectedRows.length > 1 ? 's' : ''}</span>
          <span style={{ marginRight: 16 }}>Total HT : <strong style={{ color: '#34d399', fontFamily: 'monospace' }}>{fmt(totalHT)} €</strong></span>
          {totalTVA > 0 && <span style={{ marginRight: 16 }}>TVA : <strong style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{fmt(totalTVA)} €</strong></span>}
          <span>Total TTC : <strong style={{ color: 'var(--text-2)', fontFamily: 'monospace' }}>{fmt(totalTTC)} €</strong></span>
        </div>
        {someInvalid && (
          <div style={{ fontSize: 11, color: '#f59e0b' }}>⚠ Certaines lignes ont une date ou un montant manquant</div>
        )}
        {rows.some(r => !r.selected && (!r.date || r.amount_ht === 0)) && (
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
            ⓘ {rows.filter(r => !r.selected && (!r.date || r.amount_ht === 0)).length} ligne(s) sans date ou à 0 € décochée(s) automatiquement
          </div>
        )}
        <button onClick={handleImport} disabled={saving || selectedRows.length === 0}
          style={{
            padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: selectedRows.length > 0 ? 'rgba(20,184,166,0.2)' : 'var(--bg-2)',
            border: `1px solid ${selectedRows.length > 0 ? 'rgba(20,184,166,0.4)' : 'var(--bg-2)'}`,
            color: selectedRows.length > 0 ? '#14b8a6' : 'var(--text-2)',
            cursor: saving || selectedRows.length === 0 ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>
          {saving ? 'Import en cours…' : `📥 Importer ${selectedRows.length} ligne${selectedRows.length > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
