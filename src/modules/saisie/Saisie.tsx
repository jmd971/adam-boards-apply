import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { sb, OCR_PROXY_URL } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { buildRAW } from '@/lib/calc'
import { canWrite, type Role } from '@/lib/roles'
import type { ManualEntry } from '@/types'
import { useTenantId } from '@/store'

const CATEGORIES = [
  { cat: 'Vente', acc: '706', subs: [
    'Ventes de marchandises (707)','Prestations de services (706)','Travaux (704)',
    'Négoce (707)','Location de biens (713)','Commissions reçues (708)',
    'Subventions (740)','Revenus financiers (76)','Reprises sur provisions (781)',
    'Activité annexe (708)','Autre produit (70)',
  ]},
  { cat: 'Achat', acc: '607', subs: [
    'Achats de marchandises (607)','Matières premières (601)','Matières consommables (602)',
    'Fournitures non stockées (606)','Emballages (603)','Sous-traitance générale (611)',
    'Variation de stocks (603)','Autre achat (609)',
  ]},
  { cat: 'Depense', acc: '626', subs: [
    // 61x — Services extérieurs A
    'Loyer et charges locatives (613/614)','Crédit-bail (612)','Entretien et réparations (615)',
    'Assurances (616)','Documentation et abonnements (618)','Concessions et brevets (611)',
    // 62x — Services extérieurs B
    'Personnel extérieur (621)','Honoraires et commissions (622)','Frais d\'actes et contentieux (622)',
    'Publicité et marketing (623)','Frais de représentation (623)','Cadeaux clients (623)',
    'Transports sur achats (624)','Transports sur ventes (624)',
    'Déplacements et missions (625)','Repas d\'affaires (625)','Carburant (625)',
    'Téléphone et Internet (626)','Affranchissements (626)','Services bancaires (627)',
    'Cotisations professionnelles (628)',
    // 63x — Impôts et taxes
    'Formation professionnelle (633)','Taxe apprentissage (632)','Taxe foncière (635)',
    'CFE / CVAE (635)','TVA non récupérable (635)','Autres impôts et taxes (635)',
    // 64x — Charges de personnel
    'Salaires bruts (641)','Primes et intéressements (648)','Charges patronales URSSAF (645)',
    'Mutuelle et prévoyance (646)','Retraite complémentaire (645)',
    // 65x — Autres charges de gestion
    'Créances irrécouvrables (654)','Redevances et royalties (651)',
    // 66x — Charges financières
    'Intérêts bancaires (661)','Charges sur emprunts (661)',
    // 67x — Charges exceptionnelles
    'Charges exceptionnelles (671)',
    // 68x — Dotations
    'Dotations aux amortissements (681)','Dotations aux provisions (681)',
    // Autre
    'Electricité / Energie (606)','Eau (606)','Fournitures de bureau (606)',
    'Abonnements logiciels (618)','Autre charge (658)',
  ]},
  { cat: 'Immobilisation', acc: '2181', subs: [
    'Logiciels et licences (205)','Brevets et marques (205)','Fonds commercial (207)',
    'Matériel informatique (2183)','Matériel de bureau (2184)','Mobilier (2184)',
    'Agencements et installations (2131)','Matériel de transport (2182)',
    'Matériel industriel (2154)','Matériel médical (2186)',
    'Constructions (213)','Terrains (211)',
    'Participations (261)','Dépôts et cautionnements (275)',
    'Autre immobilisation (218)',
  ]},
] as { cat: ManualEntry['category']; subs: string[]; acc: string }[]

const OCR_PROMPT = `Tu es un expert-comptable. Analyse cette facture et retourne UNIQUEMENT un JSON valide sans backticks ni markdown.
Champs requis:
1. date: date émission YYYY-MM-DD
2. amount_ttc: montant total TTC (nombre décimal)
3. amount_ht: montant total HT (nombre décimal)
4. category: Vente ou Achat ou Depense
5. subcategory: sous-catégorie précise
6. label: description courte
7. counterpart: nom fournisseur ou client

Répondre UNIQUEMENT avec: {"date":"YYYY-MM-DD","amount_ttc":0.00,"amount_ht":0.00,"category":"Depense","subcategory":"Autre dépense","label":"Description","counterpart":"Nom"}`

type Mode = 'manual' | 'ocr' | 'csv'

// Calcule le taux de TVA à partir de HT et TTC
function calcTvaRate(ht: number, ttc: number): string {
  if (!ht || !ttc || ht <= 0 || ttc <= 0) return ''
  const tva = ttc - ht
  const rate = (tva / ht) * 100
  return rate.toFixed(2)
}

// Calcule la TVA en montant
function calcTvaAmount(ht: number, ttc: number): number {
  return Math.round((ttc - ht) * 100) / 100
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function calcEcheancierDates(startDate: string, nb: number, delaiJours: number): string[] {
  const dates: string[] = []
  if (!startDate || nb <= 0) return dates
  const start = new Date(startDate)
  for (let i = 0; i < nb; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i * delaiJours)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export function Saisie() {
  const RAW            = useAppStore(s => s.RAW)
  const filters        = useAppStore(s => s.filters)
  const role           = useAppStore(s => s.role) as Role
  const tenantId       = useTenantId()
  const setRAW         = useAppStore(s => s.setRAW)
  const setManualEntries = useAppStore(s => s.setManualEntries)
  const manualEntries  = useAppStore(s => s.manualEntries)
  const isReadOnly     = !canWrite(role)
  
  const [mode,       setMode]       = useState<Mode>('manual')
  const [entries,    setEntries]    = useState<ManualEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult,  setOcrResult]  = useState<string | null>(null)
  const [ocrFile,    setOcrFile]    = useState<File | null>(null)

  const [search,     setSearch]     = useState('')
  const [filterCat,  setFilterCat]  = useState<string>('Tous')
  const [sortCol,    setSortCol]    = useState<'entry_date'|'amount_ht'|'amount_ttc'|'counterpart'>('entry_date')
  const [sortDir,    setSortDir]    = useState<'asc'|'desc'>('desc')
  const [page,          setPage]          = useState(0)
  const [echNb,         setEchNb]         = useState(3)
  const [echDelaiJours, setEchDelaiJours] = useState(30)
  const [echStartDate,  setEchStartDate]  = useState('')
  const [echDates,      setEchDates]      = useState<string[]>([])

  const [form, setForm] = useState({
    company_key:  filters.selCo[0] ?? '',
    entry_date:   new Date().toISOString().slice(0, 10),
    category:     'Vente' as ManualEntry['category'],
    subcategory:  '',
    label:        '',
    amount_ttc:   '',
    amount_ht:    '',
    counterpart:  '',
    payment_mode: 'virement',
  })

  // TVA calculée automatiquement
  const tvaAmount = form.amount_ht && form.amount_ttc
    ? calcTvaAmount(parseFloat(form.amount_ht), parseFloat(form.amount_ttc))
    : null
  const tvaRate = form.amount_ht && form.amount_ttc
    ? calcTvaRate(parseFloat(form.amount_ht), parseFloat(form.amount_ttc))
    : null

  useEffect(() => {
    sb.from('manual_entries').select('*').order('entry_date', { ascending: false }).limit(50)
      .then(({ data }) => { setEntries((data ?? []) as ManualEntry[]); setLoading(false) })
  }, [])

  const displayEntries = useMemo(() => {
    let result = entries
    if (filterCat !== 'Tous') result = result.filter(e => e.category === filterCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        (e.label || '').toLowerCase().includes(q) ||
        (e.counterpart || '').toLowerCase().includes(q) ||
        (e.subcategory || '').toLowerCase().includes(q) ||
        e.entry_date.includes(q) ||
        fmtDate(e.entry_date).includes(q)
      )
    }
    return [...result].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortCol) {
        case 'amount_ht':   av = parseFloat(a.amount_ht||a.amount_ht_saisie||'0'); bv = parseFloat(b.amount_ht||b.amount_ht_saisie||'0'); break
        case 'amount_ttc':  av = parseFloat(a.amount_ttc||'0');  bv = parseFloat(b.amount_ttc||'0');  break
        case 'counterpart': av = (a.counterpart||'').toLowerCase(); bv = (b.counterpart||'').toLowerCase(); break
        default:            av = a.entry_date; bv = b.entry_date
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [entries, search, filterCat, sortCol, sortDir])

  const PAGE_SIZE = 20
  const pageCount = Math.ceil(displayEntries.length / PAGE_SIZE)
  const pageEntries = displayEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [search, filterCat])

  // Auto-recalcule les dates d'échéances quand les paramètres changent
  useEffect(() => {
    const start = echStartDate || form.entry_date
    if (!start) return
    setEchDates(calcEcheancierDates(start, echNb, echDelaiJours))
  }, [echStartDate, echNb, echDelaiJours, form.entry_date])

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'entry_date' ? 'desc' : 'asc') }
  }
  const sortIcon = (col: typeof sortCol) =>
    sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const catConfig = CATEGORIES.find(c => c.cat === form.category)

  // ── Rafraîchir le store après saisie ─────────────────────────────────────
  const refreshStore = async (newEntry: ManualEntry) => {
    const allEntries = [newEntry, ...manualEntries]
    setManualEntries(allEntries)
    if (RAW) {
      // Reconstruire le RAW avec les nouvelles saisies
      const { data: cd } = await sb.from('company_data').select('*')
      const { data: bd } = await sb.from('budget').select('*')
      if (cd) {
        const newRAW = buildRAW(cd as any, (bd ?? []) as any, allEntries)
        setRAW(newRAW)
      }
    }
  }

  // ── Upload facture vers Supabase Storage ───────────────────────────────────
  // Retourne le path de stockage (le bucket "invoice" est privé — on génère
  // une URL signée à la volée au moment de l'affichage).
  const uploadInvoice = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${tenantId}/${form.company_key}/${Date.now()}.${ext}`
    const { error } = await sb.storage.from('invoice').upload(path, file)
    if (error) {
      setMsg(`⚠️ Upload facture échoué : ${error.message}`)
      return null
    }
    return path
  }

  // Ouvre la facture en générant une URL signée (bucket privé).
  // Rétro-compat : si la valeur stockée commence par "http", on l'utilise telle quelle.
  const openInvoice = async (urlOrPath: string) => {
    if (urlOrPath.startsWith('http')) { window.open(urlOrPath, '_blank', 'noopener'); return }
    const { data, error } = await sb.storage.from('invoice').createSignedUrl(urlOrPath, 3600)
    if (error || !data?.signedUrl) {
      setMsg(`⚠️ Impossible d'ouvrir la facture : ${error?.message ?? 'URL non disponible'}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  // ── OCR ───────────────────────────────────────────────────────────────────
  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrLoading(true); setOcrResult(null); setMsg(null); setOcrFile(file)
    try {
      const toBase64 = (f: File): Promise<string> => new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(f)
      })
      const base64    = await toBase64(file)
      const mediaType = file.type || 'image/jpeg'
      const isPdf     = file.type === 'application/pdf'

      const messages = isPdf
        ? [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: OCR_PROMPT }
          ]}]
        : [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: OCR_PROMPT }
          ]}]

      const session = await sb.auth.getSession()
      const resp = await fetch(OCR_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
        body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 500, messages }),
      }).catch(() => null)

      // Erreur réseau
      if (!resp) {
        setOcrResult(null)
        setMsg('⚠️ OCR indisponible (erreur réseau). La facture sera stockée — remplissez le formulaire manuellement.')
        setMode('manual')
        return
      }

      // Erreur serveur (quota, 500, etc.)
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        const reason = resp.status === 429 ? 'quota API dépassé'
          : resp.status >= 500 ? 'serveur OCR indisponible'
          : `erreur ${resp.status}`
        setOcrResult(null)
        setMsg(`⚠️ OCR échoué (${reason}). La facture sera stockée — remplissez le formulaire manuellement.${errBody ? '\n' + errBody : ''}`)
        setMode('manual')
        return
      }

      const raw  = await resp.json()
      const text = raw?.content?.[0]?.text ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        setOcrResult(null)
        setMsg('⚠️ OCR : réponse illisible. La facture sera stockée — remplissez le formulaire manuellement.')
        setMode('manual')
        return
      }

      const parsed = JSON.parse(jsonMatch[0])
      const ttc    = parseFloat(parsed.amount_ttc) || 0
      const ht     = parseFloat(parsed.amount_ht)  || 0

      setOcrResult(`✅ Facture analysée : ${parsed.counterpart || ''} — HT: ${ht.toFixed(2)} € | TTC: ${ttc.toFixed(2)} € | TVA: ${calcTvaAmount(ht, ttc).toFixed(2)} €`)
      setForm(f => ({
        ...f,
        entry_date:  parsed.date || f.entry_date,
        category:    parsed.category || f.category,
        subcategory: parsed.subcategory || '',
        label:       parsed.label || '',
        amount_ttc:  ttc > 0 ? String(ttc) : f.amount_ttc,
        amount_ht:   ht > 0  ? String(ht)  : f.amount_ht,
        counterpart: parsed.counterpart || '',
      }))
      setMode('manual')
    } catch (err: any) {
      setMsg('⚠️ OCR : ' + (err.message || 'Erreur inattendue') + '. La facture sera stockée — remplissez le formulaire manuellement.')
      setMode('manual')
    } finally {
      setOcrLoading(false)
    }
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { setMsg('❌ CSV vide ou invalide'); return }
    const sep = lines[0].includes(';') ? ';' : ','
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase())
    const imported: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
      const row: any = {}
      headers.forEach((h, j) => { row[h] = cols[j] || '' })
      const ht  = parseFloat(row.amount_ht  || row.montant_ht  || '0') || 0
      const ttc = parseFloat(row.amount_ttc || row.montant_ttc || '0') || 0
      imported.push({
        tenant_id:    tenantId,
        company_key:  form.company_key,
        entry_date:   row.date || row.entry_date || '',
        category:     row.category || row.categorie || 'Depense',
        subcategory:  row.subcategory || row.sous_categorie || '',
        label:        row.label || row.libelle || '',
        amount_ttc:   String(ttc),
        amount_ht:    String(ht),
        tva_amount:   String(calcTvaAmount(ht, ttc)),
        tva_rate:     calcTvaRate(ht, ttc),
        counterpart:  row.counterpart || row.contrepartie || '',
        payment_mode: row.payment_mode || row.reglement || 'virement',
        source:       'csv',
      })
    }
    setSaving(true)
    const { data, error } = await sb.from('manual_entries').insert(imported).select()
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }
    const newEntries = data as ManualEntry[]
    setEntries(p => [...newEntries, ...p])
    setMsg(`✅ ${newEntries.length} lignes importées`)
    // Refresh store
    const allEntries = [...newEntries, ...manualEntries]
    setManualEntries(allEntries)
    const { data: cd } = await sb.from('company_data').select('*')
    const { data: bd } = await sb.from('budget').select('*')
    if (cd && RAW) setRAW(buildRAW(cd as any, (bd ?? []) as any, allEntries))
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Soumission manuelle ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.amount_ht || !form.entry_date) return
    setSaving(true)
    const ht  = parseFloat(form.amount_ht)  || 0
    const ttc = parseFloat(form.amount_ttc) || ht  // si TTC vide, TTC = HT (TVA 0)
    const tvaAmt  = calcTvaAmount(ht, ttc)
    const tvaRte  = calcTvaRate(ht, ttc)

    // Upload facture si présente
    let invoiceUrl: string | null = null
    if (ocrFile) {
      invoiceUrl = await uploadInvoice(ocrFile)
    }

    const isEch = form.payment_mode === 'echeancier'
    const dates = isEch ? echDates : []

    const { data, error } = await sb.from('manual_entries').insert({
      tenant_id:    tenantId,
      company_key:  form.company_key,
      entry_date:   form.entry_date,
      category:     form.category,
      subcategory:  form.subcategory,
      label:        form.label,
      amount_ttc:   String(ttc),
      amount_ht:    String(ht),
      amount_ht_saisie: String(ht),
      tva_amount:   String(tvaAmt),
      tva_rate:     tvaRte,
      counterpart:  form.counterpart,
      payment_mode: form.payment_mode,
      account_num:  catConfig?.acc ?? '658',
      source:       ocrFile ? 'ocr' : 'manual',
      ...(invoiceUrl ? { invoice_url: invoiceUrl } : {}),
      ...(isEch ? {
        echeancier_data: { nb: echNb, delai_jours: echDelaiJours, dates }
      } : {}),
    }).select().single()

    if (error) { setSaving(false); setMsg('❌ ' + error.message); return }

    const newEntry = data as ManualEntry

    // Créer les entrées enfant d'échéances (pour la trésorerie)
    if (isEch && dates.length > 0) {
      const htPart  = Math.round((ht  / dates.length) * 100) / 100
      const ttcPart = Math.round((ttc / dates.length) * 100) / 100
      const childEntries = dates.map((d, i) => ({
        tenant_id:    tenantId,
        company_key:  form.company_key,
        entry_date:   d,
        category:     form.category,
        subcategory:  form.subcategory,
        label:        `Éch. ${i + 1}/${dates.length}${form.label ? ' — ' + form.label : ''}`,
        amount_ttc:   String(ttcPart),
        amount_ht:    String(htPart),
        amount_ht_saisie: String(htPart),
        tva_amount:   String(calcTvaAmount(htPart, ttcPart)),
        tva_rate:     calcTvaRate(htPart, ttcPart),
        counterpart:  form.counterpart,
        payment_mode: 'virement' as const,
        account_num:  catConfig?.acc ?? '658',
        source:       'echeance' as const,
        parent_id:    newEntry.id,
      }))
      await sb.from('manual_entries').insert(childEntries)
    }

    setSaving(false)
    setEntries(p => [newEntry, ...p])
    setMsg('✅ Entrée ajoutée — mise à jour des tableaux en cours...')

    // Rafraîchir tous les onglets
    await refreshStore(newEntry)
    setMsg('✅ Entrée ajoutée et tableaux mis à jour')
    setForm(f => ({ ...f, label:'', amount_ttc:'', amount_ht:'', counterpart:'', subcategory:'' }))
    setEchDates([])
    setOcrFile(null)
    setTimeout(() => setMsg(null), 3000)
  }

  const inputSt: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', fontSize: 12, width: '100%', outline: 'none', fontFamily: 'inherit',
  }
  const tabSt = (active: boolean): React.CSSProperties => ({
    flex:1, padding:'8px 12px', border:'none', cursor:'pointer', borderRadius:8,
    fontSize:12, fontWeight:600, transition:'all 0.15s',
    background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
    color:      active ? '#93c5fd' : '#475569',
    boxShadow:  active ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
  })

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding:'16px 24px', maxWidth:920 }}>

      {isReadOnly && (
        <div style={{ padding:'8px 14px', borderRadius:8, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'#f59e0b', fontSize:11, fontWeight:600, marginBottom:16 }}>
          Mode consultation — vous ne pouvez pas ajouter de saisies.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:20, padding:4, background:'rgba(255,255,255,0.03)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setMode('manual')} style={tabSt(mode==='manual')} disabled={isReadOnly}>✏️ Saisie manuelle</button>
        <button onClick={() => setMode('ocr')}    style={tabSt(mode==='ocr')}    disabled={isReadOnly}>📷 Scanner (OCR)</button>
        <button onClick={() => setMode('csv')}    style={tabSt(mode==='csv')}    disabled={isReadOnly}>📄 Import CSV</button>
      </div>

      {/* OCR */}
      {mode === 'ocr' && (
        <div style={{ background:'#0f172a', borderRadius:12, padding:24, border:'1px solid rgba(139,92,246,0.2)', marginBottom:24, textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#8b5cf6', marginBottom:16 }}>
            {ocrLoading ? 'Analyse en cours...' : 'Importez une facture — HT et TTC extraits automatiquement'}
          </div>
          {ocrLoading ? <Spinner size={32} /> : (
            <label style={{ padding:'10px 24px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', background:'rgba(139,92,246,0.15)', color:'#8b5cf6', border:'1px solid rgba(139,92,246,0.3)', display:'inline-block' }}>
              📷 Choisir une image ou PDF
              <input type="file" accept="image/*,.pdf" onChange={handleOCR} style={{ display:'none' }} />
            </label>
          )}
          {ocrResult && (
            <div style={{ marginTop:12, fontSize:12, color:'#10b981' }}>
              {ocrResult}<br/>
              <span style={{ color:'#475569' }}>Formulaire pré-rempli → passez en Saisie manuelle</span>
            </div>
          )}
          {ocrFile && !ocrResult && (
            <div style={{ marginTop:12, fontSize:12, color:'#f59e0b' }}>
              📎 {ocrFile.name} — prêt à être enregistré avec la saisie
            </div>
          )}
          <div style={{ marginTop:16, fontSize:11, color:'#334155' }}>JPG · PNG · PDF · Facture stockée automatiquement</div>
        </div>
      )}

      {/* CSV */}
      {mode === 'csv' && (
        <div style={{ background:'#0f172a', borderRadius:12, padding:24, border:'1px solid rgba(20,184,166,0.2)', marginBottom:24, textAlign:'center' }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#14b8a6', marginBottom:4 }}>Import CSV</div>
          <div style={{ fontSize:11, color:'#475569', marginBottom:16 }}>Colonnes : date, category, subcategory, label, amount_ht, amount_ttc, counterpart, payment_mode</div>
          {saving ? <Spinner size={24} /> : (
            <label style={{ padding:'10px 24px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', background:'rgba(20,184,166,0.15)', color:'#14b8a6', border:'1px solid rgba(20,184,166,0.3)', display:'inline-block' }}>
              📄 Choisir un fichier CSV
              <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display:'none' }} />
            </label>
          )}
          {msg && <div style={{ marginTop:12, fontSize:12, color: msg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{msg}</div>}
        </div>
      )}

      {/* Saisie manuelle */}
      {mode === 'manual' && (
        <div style={{ background:'#0f172a', borderRadius:12, padding:20, border:'1px solid rgba(255,255,255,0.06)', marginBottom:24 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:16 }}>Nouvelle saisie</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:10 }}>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Société</label>
              <select value={form.company_key} onChange={e => setForm(f => ({...f, company_key:e.target.value}))} style={inputSt}>
                {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name||k}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({...f, entry_date:e.target.value}))} style={inputSt} />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Catégorie</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category:e.target.value as ManualEntry['category'], subcategory:''}))} style={inputSt}>
                {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Sous-catégorie</label>
              <select value={form.subcategory} onChange={e => setForm(f => ({...f, subcategory:e.target.value}))} style={inputSt}>
                <option value="">— Choisir —</option>
                {catConfig?.subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Montant HT € *</label>
              <input type="number" step="0.01" value={form.amount_ht}
                onChange={e => setForm(f => ({...f, amount_ht:e.target.value}))}
                style={inputSt} placeholder="0.00" />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Montant TTC €</label>
              <input type="number" step="0.01" value={form.amount_ttc}
                onChange={e => setForm(f => ({...f, amount_ttc:e.target.value}))}
                style={inputSt} placeholder="= HT si vide" />
            </div>

            {/* TVA calculée automatiquement */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>TVA (calculée)</label>
              <div style={{ ...inputSt, display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
                <span style={{ fontFamily:'monospace', color: tvaAmount !== null ? '#f59e0b' : '#334155' }}>
                  {tvaAmount !== null ? `${tvaAmount.toFixed(2)} €` : '—'}
                </span>
                <span style={{ fontSize:10, color:'#475569' }}>
                  {tvaRate ? `(${parseFloat(tvaRate).toFixed(1)} %)` : ''}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Libellé</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({...f, label:e.target.value}))} style={inputSt} placeholder="Description..." />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Contrepartie</label>
              <input type="text" value={form.counterpart} onChange={e => setForm(f => ({...f, counterpart:e.target.value}))} style={inputSt} placeholder="Fournisseur..." />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Mode règlement</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({...f, payment_mode:e.target.value}))} style={inputSt}>
                {['comptant','virement','prelevement','cb','cheque','especes','echeancier'].map(m => (
                  <option key={m} value={m}>{m === 'echeancier' ? 'Paiement échelonné' : m}</option>
                ))}
              </select>
            </div>

            {/* Écheancier : dates libres */}
            {form.payment_mode === 'echeancier' && (
              <>
                <div>
                  <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>1ère échéance</label>
                  <input type="date" value={echStartDate || form.entry_date}
                    onChange={e => setEchStartDate(e.target.value)} style={inputSt} />
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Nb d'échéances</label>
                  <input type="number" min={1} max={60} value={echNb}
                    onChange={e => setEchNb(Math.max(1, Math.min(60, Number(e.target.value))))}
                    style={inputSt} />
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:4 }}>Délai entre chaque (jours)</label>
                  <input type="number" min={1} max={365} value={echDelaiJours}
                    onChange={e => setEchDelaiJours(Math.max(1, Math.min(365, Number(e.target.value))))}
                    style={inputSt} />
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <label style={{ fontSize:10, color:'#94a3b8', display:'block', marginBottom:6 }}>Dates d'échéances (modifiables)</label>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {echDates.map((d, i) => (
                      <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <span style={{ fontSize:9, color:'#475569' }}>{i + 1}</span>
                        <input type="date" value={d}
                          onChange={e => setEchDates(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                          style={{ ...inputSt, width:130, fontSize:11, padding:'4px 6px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:14 }}>
            <button onClick={handleSubmit} disabled={saving || !form.amount_ht || isReadOnly}
              style={{ padding:'8px 20px', borderRadius:8, background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', color:'#fff', fontSize:12, fontWeight:600, cursor: saving||!form.amount_ht ? 'not-allowed':'pointer', opacity: saving||!form.amount_ht ? 0.6:1 }}>
              {saving ? 'Enregistrement...' : '+ Ajouter'}
            </button>
            {msg && <span style={{ fontSize:12, color: msg.startsWith('✅') ? '#10b981':'#ef4444' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Historique */}
      <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Historique</div>

      {/* Recherche + filtres */}
      {!loading && entries.length > 0 && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Rechercher (libellé, contrepartie, sous-catégorie...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputSt, flex:'1 1 220px', minWidth:200, maxWidth:380 }}
          />
          <div style={{ display:'flex', gap:4 }}>
            {(['Tous','Vente','Achat','Depense'] as const).map(cat => {
              const active = filterCat === cat
              const accent = cat === 'Vente' ? '#10b981' : cat === 'Achat' ? '#ef4444' : cat === 'Depense' ? '#f59e0b' : '#60a5fa'
              return (
                <button key={cat} onClick={() => setFilterCat(cat)} style={{
                  padding:'5px 10px', borderRadius:6, border: active ? `1px solid ${accent}` : '1px solid transparent',
                  cursor:'pointer', fontSize:11, fontWeight:600, transition:'all 0.15s',
                  background: active ? `${accent}22` : 'rgba(255,255,255,0.03)',
                  color: active ? accent : '#475569',
                }}>{cat}</button>
              )
            })}
          </div>
          <span style={{ fontSize:10, color:'#334155', marginLeft:4 }}>
            {displayEntries.length} résultat{displayEntries.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {loading ? <Spinner size={24} /> : entries.length === 0 ? (
        <div style={{ fontSize:12, color:'#334155', textAlign:'center', padding:40 }}>Aucune saisie pour le moment.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:'#0f172a' }}>
                {([
                  { label:'Date',               col:'entry_date'  as const, align:'left'  },
                  { label:'Pièce',               col:null,                   align:'left'  },
                  { label:'Catégorie',           col:null,                   align:'left'  },
                  { label:'Sous-cat. / Libellé', col:null,                   align:'left'  },
                  { label:'Contrepartie',        col:'counterpart' as const, align:'left'  },
                  { label:'HT €',                col:'amount_ht'   as const, align:'right' },
                  { label:'TVA €',               col:null,                   align:'right' },
                  { label:'TTC €',               col:'amount_ttc'  as const, align:'right' },
                  { label:'Règlement',            col:null,                   align:'left'  },
                  { label:'Source',               col:null,                   align:'left'  },
                ] as { label:string; col:'entry_date'|'amount_ht'|'amount_ttc'|'counterpart'|null; align:string }[]).map(({ label, col, align }) => (
                  <th key={label} onClick={col ? () => handleSort(col) : undefined} style={{
                    padding:'6px 8px', textAlign: align as 'left'|'right',
                    color: col && sortCol === col ? '#93c5fd' : '#475569',
                    fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)',
                    whiteSpace:'nowrap', cursor: col ? 'pointer' : 'default', userSelect:'none',
                  }}>
                    {label}{col ? sortIcon(col) : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageEntries.map(e => {
                const ht  = parseFloat(e.amount_ht||e.amount_ht_saisie||'0')||0
                const ttc = parseFloat(e.amount_ttc||'0')||0
                const tva = calcTvaAmount(ht, ttc)
                return (
                  <tr key={e.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding:'6px 8px', color:'#475569', whiteSpace:'nowrap' }}>{fmtDate(e.entry_date)}</td>
                    <td style={{ padding:'6px 8px', fontSize:11 }}>
                      {e.invoice_url
                        ? <button onClick={() => openInvoice(e.invoice_url!)} style={{ background:'none', border:'none', padding:0, color:'#60a5fa', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>📄 Voir</button>
                        : <span style={{ color:'#64748b' }}>—</span>}
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <span style={{ padding:'2px 6px', borderRadius:20, fontSize:10,
                        background: e.category==='Vente' ? 'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',
                        color:      e.category==='Vente' ? '#10b981':'#ef4444' }}>
                        {e.category}
                      </span>
                    </td>
                    <td style={{ padding:'6px 8px', color:'#94a3b8', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {e.subcategory}{e.label ? ' — '+e.label : ''}
                    </td>
                    <td style={{ padding:'6px 8px', color:'#64748b', whiteSpace:'nowrap' }}>{e.counterpart||'—'}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#f1f5f9' }}>{ht.toFixed(2)}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#f59e0b' }}>{tva !== 0 ? tva.toFixed(2) : '—'}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color: e.category==='Vente' ? '#10b981':'#f1f5f9' }}>{ttc.toFixed(2)}</td>
                    <td style={{ padding:'6px 8px', color:'#64748b' }}>{e.payment_mode||'—'}</td>
                    <td style={{ padding:'6px 8px', color:'#8b5cf6', fontSize:9 }}>{e.source}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 0', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page===0?'#1e293b':'#475569', cursor: page===0?'default':'pointer', fontSize:11 }}>«</button>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page===0?'#1e293b':'#475569', cursor: page===0?'default':'pointer', fontSize:11 }}>‹</button>
              <span style={{ fontSize:11, color:'#475569' }}>Page {page+1} / {pageCount} — {displayEntries.length} entrée{displayEntries.length>1?'s':''}</span>
              <button onClick={() => setPage(p => Math.min(pageCount-1, p+1))} disabled={page >= pageCount-1} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page>=pageCount-1?'#1e293b':'#475569', cursor: page>=pageCount-1?'default':'pointer', fontSize:11 }}>›</button>
              <button onClick={() => setPage(pageCount-1)} disabled={page >= pageCount-1} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page>=pageCount-1?'#1e293b':'#475569', cursor: page>=pageCount-1?'default':'pointer', fontSize:11 }}>»</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
