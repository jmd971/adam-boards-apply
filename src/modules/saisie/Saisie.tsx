import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/store'
import { sb, OCR_PROXY_URL } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { buildRAW, fmt } from '@/lib/calc'
import { canWrite, type Role } from '@/lib/roles'
import type { ManualEntry } from '@/types'
import { useTenantId } from '@/store'
import { useQueryClient } from '@tanstack/react-query'

// Durées d'amortissement PCG (en années)
const IMMO_DUREES: Record<string, { duree: number; acc: string; amortAcc: string }> = {
  'Frais d\'établissement':             { duree: 5,  acc: '201',  amortAcc: '2801' },
  'Logiciels':                          { duree: 3,  acc: '205',  amortAcc: '2805' },
  'Brevets / Licences':                 { duree: 5,  acc: '205',  amortAcc: '2805' },
  'Fonds commercial':                   { duree: 10, acc: '207',  amortAcc: '2807' },
  'Droit au bail':                      { duree: 10, acc: '206',  amortAcc: '2806' },
  'Terrains':                           { duree: 0,  acc: '211',  amortAcc: '' },
  'Constructions':                      { duree: 25, acc: '213',  amortAcc: '2813' },
  'Agencements / Installations':        { duree: 10, acc: '2135', amortAcc: '28135' },
  'Matériel industriel':                { duree: 7,  acc: '2154', amortAcc: '28154' },
  'Matériel de transport':              { duree: 5,  acc: '2182', amortAcc: '28182' },
  'Matériel de bureau':                 { duree: 5,  acc: '2183', amortAcc: '28183' },
  'Matériel informatique':              { duree: 3,  acc: '2183', amortAcc: '28183' },
  'Mobilier':                           { duree: 10, acc: '2184', amortAcc: '28184' },
  'Téléphonie':                         { duree: 3,  acc: '2183', amortAcc: '28183' },
  'Outillage':                          { duree: 5,  acc: '2155', amortAcc: '28155' },
  'Autre immobilisation corporelle':    { duree: 5,  acc: '218',  amortAcc: '2818' },
  'Autre immobilisation incorporelle':  { duree: 5,  acc: '208',  amortAcc: '2808' },
}

// Mapping sous-catégorie → compte PCG
const SUBCAT_TO_ACC: Record<string, string> = {
  // Ventes
  'Prestation de service':            '706',
  'Vente de marchandise':             '707',
  'Activité annexe':                  '708',
  'Autre vente':                      '708',
  // Achats
  'Marchandises':                     '607',
  'Matières premières':               '601',
  'Sous-traitance':                   '604',
  'Autre achat':                      '608',
  // Charges 61
  'Sous-traitance générale':          '611',
  'Crédit-bail mobilier':             '6122',
  'Crédit-bail immobilier':           '6125',
  'Locations mobilières':             '6135',
  'Locations immobilières':           '6132',
  'Charges de copropriété':           '614',
  'Entretien / Réparation':           '615',
  'Assurance multirisque':            '6161',
  'Assurance véhicules':              '6163',
  'Assurance RC professionnelle':     '6162',
  'Autre assurance':                  '616',
  'Études et recherches':             '617',
  'Documentation technique':          '618',
  // Charges 62
  'Personnel intérimaire':            '6211',
  'Personnel détaché':                '6214',
  'Honoraires comptable':             '6226',
  'Honoraires avocat':                '6226',
  'Honoraires notaire':               '6226',
  'Honoraires consultant':            '6226',
  'Autres honoraires':                '622',
  'Commissions sur ventes':           '6222',
  'Courtages':                        '6224',
  'Publicité / Annonces':             '6231',
  'Catalogues / Imprimés':            '6233',
  'Foires et expositions':            '6233',
  'Publications':                     '6236',
  'Transports sur achats':            '6241',
  'Transports sur ventes':            '6242',
  'Déménagement':                     '6244',
  'Voyages et déplacements':          '6251',
  'Frais de mission':                 '6256',
  'Frais de réception':               '6257',
  'Téléphone / Internet':             '6262',
  'Affranchissement / Colis':         '6261',
  'Services bancaires':               '627',
  'Frais sur effets':                 '6275',
  'Concours divers / Cotisations':    '6281',
  // Charges 63
  'Taxe foncière':                    '63512',
  'CFE / CVAE':                       '6351',
  'TVS':                              '6354',
  'Taxe apprentissage':               '6312',
  'Formation continue':               '6311',
  'Autres impôts et taxes':           '637',
  // Charges 64
  'Salaires':                         '6411',
  'Primes':                           '6412',
  'Congés payés':                     '6413',
  'Indemnités':                       '6414',
  'Charges sociales URSSAF':          '6451',
  'Cotisations retraite':             '6453',
  'Mutuelle / Prévoyance':            '6452',
  // Charges 65
  'Redevances brevets / Licences':    '651',
  'Pertes sur créances':              '654',
  'Dons / Subventions versés':        '6586',
  // Charges 66
  'Intérêts bancaires':               '6615',
  'Intérêts emprunts':                '6611',
  'Escomptes accordés':               '665',
  'Pertes de change':                 '666',
  // Charges 67
  'Pénalités / Amendes':              '6712',
  'Cessions d\'immobilisations':      '675',
  'Rappels d\'impôts':                '6717',
  // Dotations 68
  'Amortissement immobilisations':    '6811',
  'Provision risques':                '6815',
  'Provision dépréciation':           '6816',
  // Divers
  'Fournitures bureau':               '6064',
  'Fournitures administratives':      '6064',
  'Carburant':                        '6063',
  'Péages / Parking':                 '6256',
  'Eau / Énergie / Électricité':      '6061',
  'Abonnement logiciel':              '6228',
  'Abonnement professionnel':         '6281',
  'Petit outillage':                  '6063',
  'Matériel informatique < 500 €':    '6064',
  'Autre dépense':                    '658',
}

const CATEGORIES = [
  { cat: 'Vente',   subs: ['Prestation de service','Vente de marchandise','Activité annexe','Autre vente'],   acc: '706' },
  { cat: 'Achat',   subs: ['Marchandises','Matières premières','Sous-traitance','Autre achat'],                acc: '607' },
  { cat: 'Immobilisation', subs: Object.keys(IMMO_DUREES), acc: '21' },
  { cat: 'Depense', subs: [
    // 61 – Services extérieurs
    'Sous-traitance générale',
    'Crédit-bail mobilier', 'Crédit-bail immobilier',
    'Locations mobilières', 'Locations immobilières',
    'Charges de copropriété',
    'Entretien / Réparation',
    'Assurance multirisque', 'Assurance véhicules', 'Assurance RC professionnelle', 'Autre assurance',
    'Études et recherches',
    'Documentation technique',
    // 62 – Autres services extérieurs
    'Personnel intérimaire', 'Personnel détaché',
    'Honoraires comptable', 'Honoraires avocat', 'Honoraires notaire', 'Honoraires consultant', 'Autres honoraires',
    'Commissions sur ventes', 'Courtages',
    'Publicité / Annonces', 'Catalogues / Imprimés', 'Foires et expositions', 'Publications',
    'Transports sur achats', 'Transports sur ventes', 'Déménagement',
    'Voyages et déplacements', 'Frais de mission', 'Frais de réception',
    'Téléphone / Internet', 'Affranchissement / Colis',
    'Services bancaires', 'Frais sur effets',
    'Concours divers / Cotisations',
    // 63 – Impôts et taxes
    'Taxe foncière', 'CFE / CVAE', 'TVS', 'Taxe apprentissage', 'Formation continue', 'Autres impôts et taxes',
    // 64 – Charges de personnel
    'Salaires', 'Primes', 'Congés payés', 'Indemnités',
    'Charges sociales URSSAF', 'Cotisations retraite', 'Mutuelle / Prévoyance',
    // 65 – Autres charges de gestion
    'Redevances brevets / Licences', 'Pertes sur créances', 'Dons / Subventions versés',
    // 66 – Charges financières
    'Intérêts bancaires', 'Intérêts emprunts', 'Escomptes accordés', 'Pertes de change',
    // 67 – Charges exceptionnelles
    'Pénalités / Amendes', 'Cessions d\'immobilisations', 'Rappels d\'impôts',
    // 68 – Dotations
    'Amortissement immobilisations', 'Provision risques', 'Provision dépréciation',
    // Divers
    'Fournitures bureau', 'Fournitures administratives',
    'Carburant', 'Péages / Parking',
    'Eau / Énergie / Électricité',
    'Abonnement logiciel', 'Abonnement professionnel',
    'Petit outillage', 'Matériel informatique < 500 €',
    'Autre dépense',
  ],                                                                                                          acc: '626' },
]

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
  if (!ht || !ttc || ht <= 0 || ttc <= 0) return '0'
  const tva = ttc - ht
  const rate = (tva / ht) * 100
  return rate.toFixed(2)
}

// Calcule la TVA en montant
function calcTvaAmount(ht: number, ttc: number): number {
  return Math.round((ttc - ht) * 100) / 100
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
  const queryClient    = useQueryClient()
  
  const [mode,       setMode]       = useState<Mode>('manual')
  const [entries,    setEntries]    = useState<ManualEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult,  setOcrResult]  = useState<string | null>(null)
  const [ocrFile,    setOcrFile]    = useState<File | null>(null)

  // Filtres, tri et pagination pour l'historique
  const [histSearch, setHistSearch] = useState('')
  const [histCatFilter, setHistCatFilter] = useState<'all' | 'Vente' | 'Achat' | 'Depense' | 'Immobilisation'>('all')
  const [histCoFilter, setHistCoFilter] = useState<string>('all')
  const [histSortCol, setHistSortCol] = useState<'date'|'category'|'subcategory'|'counterpart'|'ht'|'tva'|'ttc'|'payment'>('date')
  const [histSortDir, setHistSortDir] = useState<1 | -1>(-1)
  const [histPage, setHistPage] = useState(1)
  const HIST_PAGE_SIZE = 50

  // Édition / suppression
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Format date FR JJ/MM/AAAA
  const formatDateFR = (iso: string | undefined): string => {
    if (!iso) return '—'
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return iso
    return `${m[3]}/${m[2]}/${m[1]}`
  }

  const [form, setForm] = useState({
    company_key:   filters.selCo[0] ?? '',
    entry_date:    new Date().toISOString().slice(0, 10),
    category:      'Vente' as ManualEntry['category'],
    subcategory:   '',
    label:         '',
    amount_ttc:    '',
    amount_ht:     '',
    counterpart:   '',
    payment_mode:  'virement',
    payment_date:  '',
  })

  // ── Échéancier ──────────────────────────────────────────────────────────
  interface Echeance { date: string; amount: number }
  const [useSchedule, setUseSchedule] = useState(false)
  const [nbEcheances, setNbEcheances] = useState(2)
  const [delaiJours, setDelaiJours]   = useState(30)
  const [echeances, setEcheances]     = useState<Echeance[]>([])

  // Recalculer les échéances avec délai en jours
  const recalcEcheances = (nb: number, totalTtc: number, startDate: string, delai: number) => {
    const perInstall = Math.floor(totalTtc * 100 / nb) / 100
    const reste = Math.round((totalTtc - perInstall * (nb - 1)) * 100) / 100
    const newEch: Echeance[] = []
    for (let i = 0; i < nb; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + delai * i)
      newEch.push({
        date: d.toISOString().slice(0, 10),
        amount: i === nb - 1 ? reste : perInstall,
      })
    }
    setEcheances(newEch)
  }

  const handleToggleSchedule = (checked: boolean) => {
    setUseSchedule(checked)
    if (checked) {
      const ttc = parseFloat(form.amount_ttc) || parseFloat(form.amount_ht) || 0
      recalcEcheances(nbEcheances, ttc, form.entry_date, delaiJours)
    }
  }

  const handleNbEcheancesChange = (nb: number) => {
    const clamped = Math.max(2, Math.min(24, nb))
    setNbEcheances(clamped)
    const ttc = parseFloat(form.amount_ttc) || parseFloat(form.amount_ht) || 0
    recalcEcheances(clamped, ttc, form.entry_date, delaiJours)
  }

  const handleDelaiChange = (jours: number) => {
    const clamped = Math.max(1, Math.min(365, jours))
    setDelaiJours(clamped)
    const ttc = parseFloat(form.amount_ttc) || parseFloat(form.amount_ht) || 0
    recalcEcheances(nbEcheances, ttc, form.entry_date, clamped)
  }

  const updateEcheance = (idx: number, field: 'date' | 'amount', value: string) => {
    setEcheances(prev => prev.map((e, i) => i === idx
      ? { ...e, [field]: field === 'amount' ? (parseFloat(value) || 0) : value }
      : e
    ))
  }

  // ── Édition d'une facture : charger dans le formulaire ─────────────
  const handleEditFacture = (e: ManualEntry) => {
    setEditingId(String(e.id))
    setForm({
      company_key:  e.company_key || filters.selCo[0] || '',
      entry_date:   e.entry_date || new Date().toISOString().slice(0, 10),
      category:     e.category,
      subcategory:  e.subcategory || '',
      label:        e.label || '',
      amount_ttc:   e.amount_ttc || '',
      amount_ht:    e.amount_ht || e.amount_ht_saisie || '',
      counterpart:  e.counterpart || '',
      payment_mode:  e.payment_mode || 'virement',
      payment_date:  e.payment_date || '',
    })
    setMode('manual')
    setUseSchedule(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setMsg('✏️ Modification en cours — modifiez puis cliquez Enregistrer')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm(f => ({ ...f, label:'', amount_ttc:'', amount_ht:'', counterpart:'', subcategory:'', payment_date:'' }))
    setMsg(null)
  }

  // ── Suppression d'une facture (et ses échéances/amortissements liés) ─
  const handleDeleteFacture = async (id: string) => {
    setSaving(true)
    // Supprimer les enfants (échéances, amortissements)
    await sb.from('manual_entries').delete().eq('parent_id', id)
    // Supprimer la facture
    const { error } = await sb.from('manual_entries').delete().eq('id', id)
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }

    // Mettre à jour le state local et le store
    const newEntries = entries.filter(en => String(en.id) !== id && en.parent_id !== id)
    setEntries(newEntries)
    setManualEntries(newEntries)
    if (RAW) {
      const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId!)
      const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId!)
      if (cd) setRAW(buildRAW(cd as any, (bd ?? []) as any, newEntries))
    }
    queryClient.invalidateQueries({ queryKey: ['companyData'] })
    setConfirmDelete(null)
    setMsg('✅ Facture supprimée')
    setTimeout(() => setMsg(null), 3000)
  }

  // TVA calculée automatiquement
  const tvaAmount = form.amount_ht && form.amount_ttc
    ? calcTvaAmount(parseFloat(form.amount_ht), parseFloat(form.amount_ttc))
    : null
  const tvaRate = form.amount_ht && form.amount_ttc
    ? calcTvaRate(parseFloat(form.amount_ht), parseFloat(form.amount_ttc))
    : null

  useEffect(() => {
    sb.from('manual_entries').select('*').order('entry_date', { ascending: false })
      .then(({ data }) => { setEntries((data ?? []) as ManualEntry[]); setLoading(false) })
  }, [])

  const catConfig = CATEGORIES.find(c => c.cat === form.category)

  // ── Upload facture vers Supabase Storage ───────────────────────────────────
  const uploadInvoice = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${tenantId}/${form.company_key}/${Date.now()}.${ext}`
    const { error } = await sb.storage.from('invoice').upload(path, file)
    if (error) {
      const detail = error.message.toLowerCase().includes('bucket')
        ? 'Le bucket "invoice" n\'existe pas dans Supabase Storage. Créez-le dans le dashboard Supabase → Storage.'
        : error.message
      setMsg(`⚠️ Upload facture échoué : ${detail}`)
      return null
    }
    const { data } = sb.storage.from('invoice').getPublicUrl(path)
    return data.publicUrl
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
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 500, messages }),
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
    const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId!)
    const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId!)
    if (cd && RAW) setRAW(buildRAW(cd as any, (bd ?? []) as any, allEntries))
    queryClient.invalidateQueries({ queryKey: ['companyData'] })
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Soumission manuelle ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.amount_ht || !form.entry_date) return
    setSaving(true)
    const ht  = parseFloat(form.amount_ht)  || 0
    const ttc = parseFloat(form.amount_ttc) || ht
    const tvaAmt  = calcTvaAmount(ht, ttc)
    const tvaRte  = calcTvaRate(ht, ttc)

    // Upload facture si présente
    let invoiceUrl: string | null = null
    if (ocrFile) {
      invoiceUrl = await uploadInvoice(ocrFile)
    }

    const scheduleLabel = form.category === 'Vente' ? 'Encaissement' : 'Paiement'

    // Déterminer le compte comptable
    const isImmo = form.category === 'Immobilisation'
    const immoConfig = isImmo && form.subcategory ? IMMO_DUREES[form.subcategory] : null
    const accountNum = isImmo && immoConfig
      ? immoConfig.acc
      : (SUBCAT_TO_ACC[form.subcategory] || catConfig?.acc || '658')

    // 1. Créer ou mettre à jour la facture
    const invoiceRow = {
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
      payment_date: form.payment_date || null,
      account_num:  accountNum,
      source:       ocrFile ? 'ocr' : 'manual',
      ...(invoiceUrl ? { invoice_url: invoiceUrl } : {}),
    }

    let invoice: ManualEntry
    if (editingId) {
      // UPDATE
      const { data, error } = await sb.from('manual_entries').update(invoiceRow).eq('id', editingId).select().single()
      if (error) { setSaving(false); setMsg('❌ ' + error.message); return }
      invoice = data as ManualEntry
      // Supprimer les anciennes échéances/amortissements liés (on les recrée si besoin)
      await sb.from('manual_entries').delete().eq('parent_id', editingId)
    } else {
      // INSERT
      const { data, error } = await sb.from('manual_entries').insert(invoiceRow).select().single()
      if (error) { setSaving(false); setMsg('❌ ' + error.message); return }
      invoice = data as ManualEntry
    }

    // 2. Si immobilisation amortissable, créer les écritures d'amortissement (681)
    // Amortissement linéaire avec prorata temporis :
    // - 1ère année : du jour d'achat au 31/12 → prorata en jours
    // - Années pleines : annuité complète
    // - Dernière année : du 01/01 à la date anniversaire → le solde restant
    let amortEntries: ManualEntry[] = []
    if (isImmo && immoConfig && immoConfig.duree > 0) {
      const annuitePleine = Math.round((ht / immoConfig.duree) * 100) / 100
      const dateAchat = new Date(form.entry_date)
      const jourAchat = dateAchat.getDate()
      const moisAchat = dateAchat.getMonth() // 0-11
      const anneeAchat = dateAchat.getFullYear()

      // Jours restants dans l'année d'achat (du jour d'achat au 31/12)
      const finAnnee = new Date(anneeAchat, 11, 31)
      const debutAnnee = new Date(anneeAchat, 0, 1)
      const joursAnnee = Math.round((finAnnee.getTime() - debutAnnee.getTime()) / 86400000) + 1
      const joursRestants = Math.round((finAnnee.getTime() - dateAchat.getTime()) / 86400000) + 1
      const prorata1 = joursRestants / joursAnnee

      const amortRows = []
      let cumul = 0

      // Nombre total de lignes = durée + 1 si prorata (1ère année partielle + dernière année partielle)
      // Sauf si achat au 01/01 → pas de prorata
      const hasProrata = moisAchat > 0 || jourAchat > 1
      const nbLignes = hasProrata ? immoConfig.duree + 1 : immoConfig.duree

      for (let y = 0; y < nbLignes; y++) {
        let montant: number
        const anneeEcriture = anneeAchat + y

        if (y === 0 && hasProrata) {
          // 1ère année : prorata temporis
          montant = Math.round(annuitePleine * prorata1 * 100) / 100
        } else if (y === nbLignes - 1) {
          // Dernière année : solde restant
          montant = Math.round((ht - cumul) * 100) / 100
        } else {
          // Années pleines
          montant = annuitePleine
        }

        if (montant <= 0) continue
        cumul += montant

        amortRows.push({
          tenant_id:    tenantId,
          company_key:  form.company_key,
          entry_date:   `${anneeEcriture}-12-31`,
          category:     'Depense' as const,
          subcategory:  'Dotation amortissement',
          label:        `DAP ${form.subcategory} — ${form.label || form.counterpart || ''} (${y + 1}/${nbLignes})`,
          amount_ttc:   String(montant),
          amount_ht:    String(montant),
          amount_ht_saisie: String(montant),
          tva_amount:   '0',
          tva_rate:     '0',
          counterpart:  form.counterpart,
          payment_mode: 'virement',
          account_num:  '6811',
          source:       'echeance' as const,
          parent_id:    String(invoice.id),
        })
      }
      const { data: amortData, error: amortErr } = await sb.from('manual_entries').insert(amortRows).select()
      if (amortErr) console.warn('Amortissements:', amortErr.message)
      amortEntries = (amortData ?? []) as ManualEntry[]
    }

    // 3. Si échéancier de paiement, créer les lignes de paiement liées
    let paymentEntries: ManualEntry[] = []
    if (useSchedule && echeances.length > 1) {
      const paymentRows = echeances.map((ech, i) => ({
        tenant_id:    tenantId,
        company_key:  form.company_key,
        entry_date:   ech.date,
        category:     form.category,
        subcategory:  form.subcategory,
        label:        `${scheduleLabel} ${form.counterpart || form.label} — éch. ${i + 1}/${echeances.length}`,
        amount_ttc:   String(ech.amount),
        amount_ht:    String(Math.round((ht * (ttc > 0 ? ech.amount / ttc : 1 / echeances.length)) * 100) / 100),
        amount_ht_saisie: '0',
        tva_amount:   '0',
        tva_rate:     '0',
        counterpart:  form.counterpart,
        payment_mode: form.payment_mode,
        account_num:  form.category === 'Vente' ? '411' : '401',
        source:       'echeance' as const,
        parent_id:    String(invoice.id),
      }))

      const { data: payData, error: payErr } = await sb.from('manual_entries').insert(paymentRows).select()
      if (payErr) console.warn('Échéances:', payErr.message)
      paymentEntries = (payData ?? []) as ManualEntry[]
    }

    setSaving(false)

    // Mettre à jour le state local : retirer l'ancienne version + ses enfants si édition
    const allNew = [invoice, ...paymentEntries, ...amortEntries]
    let updatedEntries: ManualEntry[]
    if (editingId) {
      updatedEntries = entries.filter(en => String(en.id) !== editingId && en.parent_id !== editingId)
      updatedEntries = [...allNew, ...updatedEntries]
    } else {
      updatedEntries = [...allNew, ...entries]
    }
    setEntries(updatedEntries)

    const verb = editingId ? 'Facture modifiée' : 'Facture ajoutée'
    const msgParts = [verb]
    if (amortEntries.length > 0) msgParts.push(`${amortEntries.length} amortissements`)
    if (paymentEntries.length > 0) msgParts.push(`${paymentEntries.length} échéances`)
    setMsg(`✅ ${msgParts.join(' + ')} — mise à jour en cours...`)

    // Rafraîchir le store global — mise à jour immédiate + invalidation cache
    setManualEntries(updatedEntries)
    if (RAW) {
      const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId!)
      const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId!)
      if (cd) {
        const newRAW = buildRAW(cd as any, (bd ?? []) as any, updatedEntries)
        setRAW(newRAW)
        // Étendre la plage de filtre période pour inclure les nouveaux mois
        if (newRAW.mn.length > 0) {
          const minM = newRAW.mn[0]
          const maxM = newRAW.mn[newRAW.mn.length - 1]
          const f = useAppStore.getState().filters
          const newStart = !f.startM || f.startM > minM ? minM : f.startM
          const newEnd = !f.endM || f.endM < maxM ? maxM : f.endM
          if (newStart !== f.startM || newEnd !== f.endM) {
            useAppStore.getState().setFilters({ startM: newStart, endM: newEnd })
          }
        }
      }
    }
    // Invalider le cache react-query pour que CR/SIG/etc. reçoivent les nouvelles données
    queryClient.invalidateQueries({ queryKey: ['companyData'] })

    setMsg(`✅ ${verb} et tableaux mis à jour`)
    setForm(f => ({ ...f, label:'', amount_ttc:'', amount_ht:'', counterpart:'', subcategory:'', payment_date:'' }))
    setOcrFile(null)
    setUseSchedule(false)
    setEditingId(null)
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
    <div style={{ padding:'16px 24px', maxWidth:1400 }}>

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
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Société</label>
              <select value={form.company_key} onChange={e => setForm(f => ({...f, company_key:e.target.value}))} style={inputSt}>
                {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name||k}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({...f, entry_date:e.target.value}))} style={inputSt} />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Catégorie</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category:e.target.value as ManualEntry['category'], subcategory:''}))} style={inputSt}>
                {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Sous-catégorie</label>
              <select value={form.subcategory} onChange={e => setForm(f => ({...f, subcategory:e.target.value}))} style={inputSt}>
                <option value="">— Choisir —</option>
                {catConfig?.subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Montant HT € *</label>
              <input type="number" step="0.01" value={form.amount_ht}
                onChange={e => setForm(f => ({...f, amount_ht:e.target.value}))}
                style={inputSt} placeholder="0.00" />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Montant TTC €</label>
              <input type="number" step="0.01" value={form.amount_ttc}
                onChange={e => setForm(f => ({...f, amount_ttc:e.target.value}))}
                style={inputSt} placeholder="= HT si vide" />
            </div>

            {/* TVA calculée automatiquement */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>TVA (calculée)</label>
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
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Libellé</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({...f, label:e.target.value}))} style={inputSt} placeholder="Description..." />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Contrepartie</label>
              <input type="text" value={form.counterpart} onChange={e => setForm(f => ({...f, counterpart:e.target.value}))} style={inputSt} placeholder="Fournisseur..." />
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>Mode règlement</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({...f, payment_mode:e.target.value}))} style={inputSt}>
                {['virement','prelevement','cb','cheque','especes'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize:10, color:'#475569', display:'block', marginBottom:4 }}>
                {form.category === 'Vente' ? 'Date encaissement' : 'Date paiement'}
              </label>
              <input type="date" value={form.payment_date}
                onChange={e => setForm(f => ({...f, payment_date:e.target.value}))}
                style={inputSt} />
            </div>

            {/* Durée d'amortissement pour immobilisations */}
            {form.category === 'Immobilisation' && form.subcategory && IMMO_DUREES[form.subcategory] && (() => {
              const ic = IMMO_DUREES[form.subcategory]
              const htVal = parseFloat(form.amount_ht) || 0
              const annuite = ic.duree > 0 ? htVal / ic.duree : 0

              // Calcul prorata 1ère année
              let prorata1 = ''
              if (ic.duree > 0 && form.entry_date) {
                const d = new Date(form.entry_date)
                const fin = new Date(d.getFullYear(), 11, 31)
                const deb = new Date(d.getFullYear(), 0, 1)
                const jTotal = Math.round((fin.getTime() - deb.getTime()) / 86400000) + 1
                const jRest = Math.round((fin.getTime() - d.getTime()) / 86400000) + 1
                if (jRest < jTotal) {
                  const montant1 = Math.round(annuite * jRest / jTotal)
                  prorata1 = `1ère année (prorata ${jRest}j/${jTotal}j) : ${fmt(montant1)} €`
                }
              }

              return (
                <div style={{ gridColumn:'span 2' }}>
                  <div style={{ ...inputSt, display:'flex', flexDirection:'column', gap:4, background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:10, color:'#8b5cf6', fontWeight:600 }}>
                        {ic.duree === 0 ? 'Non amortissable' : `Amortissement linéaire : ${ic.duree} ans`}
                      </span>
                      <span style={{ fontSize:9, color:'#475569' }}>
                        Compte {ic.acc}{ic.amortAcc && ` → DAP 6811 / ${ic.amortAcc}`}
                      </span>
                      {ic.duree > 0 && htVal > 0 && (
                        <span style={{ fontSize:10, color:'#a78bfa', fontFamily:'monospace' }}>
                          {fmt(Math.round(annuite))} €/an
                        </span>
                      )}
                    </div>
                    {prorata1 && (
                      <div style={{ fontSize:9, color:'#a78bfa', fontStyle:'italic' }}>
                        {prorata1}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

          </div>

          {/* ── Échéancier encaissement / paiement ─────────────────────── */}
          <div style={{ marginTop:14, padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'#94a3b8' }}>
              <input type="checkbox" checked={useSchedule} onChange={e => handleToggleSchedule(e.target.checked)}
                style={{ accentColor:'#3b82f6' }} />
              {form.category === 'Vente' ? 'Encaissement en plusieurs fois' : 'Paiement en plusieurs fois'}
            </label>

            {useSchedule && (
              <div style={{ marginTop:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap' }}>
                  <label style={{ fontSize:10, color:'#475569' }}>Nombre d'échéances</label>
                  <input type="number" min={2} max={24} value={nbEcheances}
                    onChange={e => handleNbEcheancesChange(parseInt(e.target.value) || 2)}
                    style={{ ...inputSt, width:60, textAlign:'center' }} />
                  <label style={{ fontSize:10, color:'#475569' }}>Délai entre échéances</label>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input type="number" min={1} max={365} value={delaiJours}
                      onChange={e => handleDelaiChange(parseInt(e.target.value) || 30)}
                      style={{ ...inputSt, width:60, textAlign:'center' }} />
                    <span style={{ fontSize:10, color:'#475569' }}>jours</span>
                  </div>
                  <button onClick={() => {
                    const ttc = parseFloat(form.amount_ttc) || parseFloat(form.amount_ht) || 0
                    recalcEcheances(nbEcheances, ttc, form.entry_date, delaiJours)
                  }} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.1)', color:'#60a5fa', fontSize:10, fontWeight:600, cursor:'pointer' }}>
                    Recalculer
                  </button>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 1fr', gap:'4px 8px', fontSize:11, alignItems:'center' }}>
                  <div style={{ color:'#334155', fontWeight:600, fontSize:9 }}>#</div>
                  <div style={{ color:'#334155', fontWeight:600, fontSize:9 }}>Date échéance</div>
                  <div style={{ color:'#334155', fontWeight:600, fontSize:9 }}>Montant TTC €</div>
                  {echeances.map((ech, i) => (
                    <React.Fragment key={i}>
                      <div style={{ color:'#475569', fontWeight:600 }}>{i + 1}</div>
                      <input type="date" value={ech.date}
                        onChange={e => updateEcheance(i, 'date', e.target.value)}
                        style={{ ...inputSt, fontSize:11, padding:'5px 8px' }} />
                      <input type="number" step="0.01" value={ech.amount}
                        onChange={e => updateEcheance(i, 'amount', e.target.value)}
                        style={{ ...inputSt, fontSize:11, padding:'5px 8px', textAlign:'right' }} />
                    </React.Fragment>
                  ))}
                </div>

                {echeances.length > 0 && (() => {
                  const total = echeances.reduce((s, e) => s + e.amount, 0)
                  const ttc = parseFloat(form.amount_ttc) || parseFloat(form.amount_ht) || 0
                  const diff = Math.round((total - ttc) * 100) / 100
                  return (
                    <div style={{ display:'flex', justifyContent:'flex-end', gap:12, marginTop:6, fontSize:11 }}>
                      <span style={{ color:'#475569' }}>Total échéances : <strong style={{ color:'#f1f5f9' }}>{total.toFixed(2)} €</strong></span>
                      {diff !== 0 && <span style={{ color:'#ef4444', fontWeight:600 }}>Écart : {diff > 0 ? '+' : ''}{diff.toFixed(2)} €</span>}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:14 }}>
            <button onClick={handleSubmit} disabled={saving || !form.amount_ht || isReadOnly}
              style={{ padding:'8px 20px', borderRadius:8, background: editingId ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', color:'#fff', fontSize:12, fontWeight:600, cursor: saving||!form.amount_ht ? 'not-allowed':'pointer', opacity: saving||!form.amount_ht ? 0.6:1 }}>
              {saving ? 'Enregistrement...' : (editingId ? '💾 Enregistrer modifications' : '+ Ajouter')}
            </button>
            {editingId && (
              <button onClick={handleCancelEdit}
                style={{ padding:'8px 14px', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#94a3b8', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Annuler
              </button>
            )}
            {msg && <span style={{ fontSize:12, color: msg.startsWith('✅') ? '#10b981':'#ef4444' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Historique — Factures uniquement, échéances en sous-lignes */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px' }}>Historique des factures</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={histCoFilter} onChange={e => { setHistCoFilter(e.target.value); setHistPage(1) }}
            style={{ padding:'5px 10px', borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#cbd5e1', fontSize:11, outline:'none', fontFamily:'inherit', cursor:'pointer' }}>
            <option value="all">Toutes sociétés</option>
            {RAW?.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name || k}</option>)}
          </select>
          <select value={histCatFilter} onChange={e => { setHistCatFilter(e.target.value as any); setHistPage(1) }}
            style={{ padding:'5px 10px', borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#cbd5e1', fontSize:11, outline:'none', fontFamily:'inherit', cursor:'pointer' }}>
            <option value="all">Toutes catégories</option>
            <option value="Vente">Ventes</option>
            <option value="Achat">Achats</option>
            <option value="Depense">Dépenses</option>
            <option value="Immobilisation">Immobilisations</option>
          </select>
          <input type="text" value={histSearch} onChange={e => { setHistSearch(e.target.value); setHistPage(1) }}
            placeholder="🔍 Rechercher (libellé, contrepartie, date, montant...)"
            style={{ padding:'5px 10px', borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#cbd5e1', fontSize:11, width:300, outline:'none', fontFamily:'inherit' }} />
        </div>
      </div>
      {loading ? <Spinner size={24} /> : (() => {
        // Séparer factures et échéances
        const allInvoices = entries.filter(e => e.source !== 'echeance')
        const echeancesByParent: Record<string, ManualEntry[]> = {}
        for (const e of entries) {
          if (e.source === 'echeance' && e.parent_id) {
            const pid = String(e.parent_id)
            if (!echeancesByParent[pid]) echeancesByParent[pid] = []
            echeancesByParent[pid].push(e)
          }
        }

        // Filtrage — libellé, sous-cat, contrepartie, dates (FR/ISO), montants HT/TVA/TTC
        const q = histSearch.toLowerCase().trim().replace(',', '.')
        let invoices = allInvoices.filter(e => {
          if (histCoFilter !== 'all' && e.company_key !== histCoFilter) return false
          if (histCatFilter !== 'all' && e.category !== histCatFilter) return false
          if (q) {
            const dateFR = formatDateFR(e.entry_date)
            const dateFR2 = dateFR.replace(/\//g, '')
            const dateFR3 = dateFR.replace(/\//g, '-')
            const ht = parseFloat(e.amount_ht || e.amount_ht_saisie || '0') || 0
            const ttc = parseFloat(e.amount_ttc || '0') || 0
            const tva = calcTvaAmount(ht, ttc)
            // Plusieurs formats numériques pour matcher : 1234.56, 1234,56, 1234.56€, etc.
            const formatNum = (n: number) => [
              n.toFixed(2),
              n.toFixed(2).replace('.', ','),
              String(Math.round(n)),
              n.toString(),
            ].join(' ')
            const hay = `${e.label || ''} ${e.subcategory || ''} ${e.counterpart || ''} ${e.entry_date || ''} ${dateFR} ${dateFR2} ${dateFR3} ${formatNum(ht)} ${formatNum(tva)} ${formatNum(ttc)}`.toLowerCase()
            if (!hay.includes(q)) return false
          }
          return true
        })

        // Tri
        invoices = [...invoices].sort((a, b) => {
          let va: any, vb: any
          switch (histSortCol) {
            case 'date':        va = a.entry_date || '';     vb = b.entry_date || '';     break
            case 'category':    va = a.category;             vb = b.category;             break
            case 'subcategory': va = a.subcategory || '';    vb = b.subcategory || '';    break
            case 'counterpart': va = a.counterpart || '';    vb = b.counterpart || '';    break
            case 'ht':          va = parseFloat(a.amount_ht || a.amount_ht_saisie || '0') || 0; vb = parseFloat(b.amount_ht || b.amount_ht_saisie || '0') || 0; break
            case 'tva':         va = calcTvaAmount(parseFloat(a.amount_ht||'0')||0, parseFloat(a.amount_ttc||'0')||0); vb = calcTvaAmount(parseFloat(b.amount_ht||'0')||0, parseFloat(b.amount_ttc||'0')||0); break
            case 'ttc':         va = parseFloat(a.amount_ttc || '0') || 0; vb = parseFloat(b.amount_ttc || '0') || 0; break
            case 'payment':     va = a.payment_mode || '';   vb = b.payment_mode || '';   break
          }
          if (va < vb) return -histSortDir
          if (va > vb) return histSortDir
          return 0
        })

        const toggleSort = (col: typeof histSortCol) => {
          if (histSortCol === col) setHistSortDir(d => (d === 1 ? -1 : 1) as 1 | -1)
          else { setHistSortCol(col); setHistSortDir(1) }
        }

        const SortHeader = ({ col, label, align = 'left' }: { col: typeof histSortCol; label: string; align?: 'left' | 'right' }) => (
          <th onClick={() => toggleSort(col)}
            style={{ padding:'6px 8px', textAlign: align, color: histSortCol === col ? '#60a5fa' : '#475569', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none', background:'#0f172a' }}>
            {label} <span style={{ fontSize:9, opacity:0.7 }}>{histSortCol === col ? (histSortDir === 1 ? '▲' : '▼') : '⇅'}</span>
          </th>
        )

        // Pagination
        const totalPages = Math.max(1, Math.ceil(invoices.length / HIST_PAGE_SIZE))
        const safePage = Math.min(histPage, totalPages)
        const pageStart = (safePage - 1) * HIST_PAGE_SIZE
        const pageInvoices = invoices.slice(pageStart, pageStart + HIST_PAGE_SIZE)

        return invoices.length === 0 ? (
          <div style={{ fontSize:12, color:'#334155', textAlign:'center', padding:40 }}>
            {q || histCatFilter !== 'all' || histCoFilter !== 'all' ? 'Aucun résultat pour ces filtres.' : 'Aucune facture pour le moment.'}
          </div>
        ) : (
          <div>
            <div style={{ fontSize:10, color:'#475569', marginBottom:6 }}>
              {invoices.length} facture{invoices.length > 1 ? 's' : ''} {(q || histCatFilter !== 'all' || histCoFilter !== 'all') && `(filtré sur ${allInvoices.length})`} — Page {safePage}/{totalPages} ({pageInvoices.length} affichée{pageInvoices.length > 1 ? 's' : ''})
            </div>
            <div style={{ overflowX:'auto', maxWidth:'100%', maxHeight:'70vh', overflowY:'auto', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, minWidth:1100 }}>
              <thead style={{ position:'sticky', top:0, zIndex:5 }}>
                <tr style={{ background:'#0f172a' }}>
                  <th style={{ padding:'6px 4px', width:20, background:'#0f172a' }}></th>
                  <SortHeader col="date" label="Date" />
                  <SortHeader col="category" label="Catégorie" />
                  <SortHeader col="subcategory" label="Sous-cat. / Libellé" />
                  <SortHeader col="counterpart" label="Contrepartie" />
                  <SortHeader col="ht" label="HT €" align="right" />
                  <SortHeader col="tva" label="TVA €" align="right" />
                  <SortHeader col="ttc" label="TTC €" align="right" />
                  <SortHeader col="payment" label="Règlement" />
                  <th style={{ padding:'6px 8px', color:'#475569', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)', whiteSpace:'nowrap', minWidth:88, background:'#0f172a' }}>Date règlement</th>
                  <th style={{ padding:'6px 8px', color:'#475569', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)', whiteSpace:'nowrap', minWidth:80, background:'#0f172a' }}>Pièce</th>
                  <th style={{ padding:'6px 8px', color:'#475569', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)', whiteSpace:'nowrap', minWidth:130, background:'#0f172a', textAlign:'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageInvoices.map(e => {
                  const ht  = parseFloat(e.amount_ht||e.amount_ht_saisie||'0')||0
                  const ttc = parseFloat(e.amount_ttc||'0')||0
                  const tva = calcTvaAmount(ht, ttc)
                  const childEch = echeancesByParent[String(e.id)] || []
                  const hasEch = childEch.length > 0
                  return (
                    <React.Fragment key={e.id}>
                      <tr style={{ borderBottom: hasEch ? 'none' : '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding:'6px 4px', width:20 }}>
                          {hasEch && <span style={{ fontSize:9, color:'#3b82f6', cursor:'default' }} title={`${childEch.length} échéance(s)`}>📅</span>}
                        </td>
                        <td style={{ padding:'6px 8px', color:'#94a3b8', whiteSpace:'nowrap' }}>{formatDateFR(e.entry_date)}</td>
                        <td style={{ padding:'6px 8px' }}>
                          <span style={{ padding:'2px 6px', borderRadius:20, fontSize:10,
                            background: e.category==='Vente' ? 'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',
                            color:      e.category==='Vente' ? '#10b981':'#ef4444' }}>
                            {e.category}
                          </span>
                        </td>
                        <td style={{ padding:'6px 8px', color:'#f1f5f9', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }}>
                          {e.subcategory}{e.label ? ' — '+e.label : ''}
                        </td>
                        <td style={{ padding:'6px 8px', color:'#94a3b8', whiteSpace:'nowrap' }}>{e.counterpart||'—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#f1f5f9' }}>{ht.toFixed(2)}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', color:'#f59e0b' }}>{tva !== 0 ? tva.toFixed(2) : '—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color: e.category==='Vente' ? '#10b981':'#f1f5f9' }}>{ttc.toFixed(2)}</td>
                        <td style={{ padding:'6px 8px', color:'#475569' }}>{e.payment_mode||'—'}</td>
                        <td style={{ padding:'6px 8px', color: e.payment_date ? '#10b981' : '#334155', whiteSpace:'nowrap', fontSize:10 }}>
                          {e.payment_date ? formatDateFR(e.payment_date) : '—'}
                        </td>
                        <td style={{ padding:'6px 8px', fontSize:10, whiteSpace:'nowrap', minWidth:80 }}>
                          {e.invoice_url
                            ? <a href={e.invoice_url} target="_blank" rel="noopener noreferrer" style={{ color:'#3b82f6', textDecoration:'none', fontWeight:600 }}>📄 Voir facture</a>
                            : <span style={{ color:'#334155' }}>—</span>}
                        </td>
                        <td style={{ padding:'6px 8px', fontSize:10, whiteSpace:'nowrap', textAlign:'center' }}>
                          {confirmDelete === String(e.id) ? (
                            <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                              <button onClick={() => handleDeleteFacture(String(e.id))} disabled={isReadOnly}
                                style={{ padding:'3px 8px', borderRadius:5, border:'none', background:'#ef4444', color:'#fff', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                                ✓ Confirmer
                              </button>
                              <button onClick={() => setConfirmDelete(null)}
                                style={{ padding:'3px 8px', borderRadius:5, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#94a3b8', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                              <button onClick={() => handleEditFacture(e)} disabled={isReadOnly}
                                title="Modifier"
                                style={{ padding:'3px 8px', borderRadius:5, border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.08)', color:'#60a5fa', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                                ✏️
                              </button>
                              <button onClick={() => setConfirmDelete(String(e.id))} disabled={isReadOnly}
                                title="Supprimer"
                                style={{ padding:'3px 8px', borderRadius:5, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#f87171', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                                🗑
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {/* Sous-lignes échéances */}
                      {childEch.map((p, pi) => {
                        const pTtc = parseFloat(p.amount_ttc||'0')||0
                        return (
                          <tr key={p.id} style={{ borderBottom: pi === childEch.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', background:'rgba(59,130,246,0.02)' }}>
                            <td style={{ padding:'4px 4px' }}></td>
                            <td style={{ padding:'4px 8px', color:'#475569', fontSize:10, whiteSpace:'nowrap', paddingLeft:16 }}>
                              {formatDateFR(p.entry_date)}
                            </td>
                            <td style={{ padding:'4px 8px' }}>
                              <span style={{ fontSize:9, padding:'1px 5px', borderRadius:10,
                                background:'rgba(59,130,246,0.1)', color:'#60a5fa' }}>
                                {e.category === 'Vente' ? 'Encaissement' : 'Paiement'}
                              </span>
                            </td>
                            <td colSpan={3} style={{ padding:'4px 8px', color:'#64748b', fontSize:10 }}>
                              {p.label}
                            </td>
                            <td style={{ padding:'4px 8px' }}></td>
                            <td style={{ padding:'4px 8px', textAlign:'right', fontFamily:'monospace', fontSize:10, color:'#60a5fa' }}>
                              {pTtc.toFixed(2)}
                            </td>
                            <td style={{ padding:'4px 8px', color:'#334155', fontSize:10 }}>{p.payment_mode||'—'}</td>
                            <td style={{ padding:'4px 8px', color: p.payment_date ? '#10b981' : '#334155', fontSize:10 }}>
                              {p.payment_date ? formatDateFR(p.payment_date) : '—'}
                            </td>
                            <td></td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display:'flex', justifyContent:'center', gap:4, marginTop:14, flexWrap:'wrap' }}>
                <button onClick={() => setHistPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  style={{ padding:'5px 10px', borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color: safePage === 1 ? '#334155' : '#94a3b8', fontSize:11, cursor: safePage === 1 ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
                  ‹ Précédent
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(n => {
                  if (totalPages <= 7) return true
                  if (n === 1 || n === totalPages) return true
                  if (Math.abs(n - safePage) <= 2) return true
                  return false
                }).map((n, idx, arr) => {
                  const prev = arr[idx - 1]
                  const showEllipsis = prev && n - prev > 1
                  return (
                    <React.Fragment key={n}>
                      {showEllipsis && <span style={{ padding:'5px 6px', color:'#475569', fontSize:11 }}>…</span>}
                      <button onClick={() => setHistPage(n)}
                        style={{
                          padding:'5px 11px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                          background: n === safePage ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                          border: n === safePage ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                          color: n === safePage ? '#93c5fd' : '#94a3b8',
                        }}>
                        {n}
                      </button>
                    </React.Fragment>
                  )
                })}
                <button onClick={() => setHistPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  style={{ padding:'5px 10px', borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color: safePage === totalPages ? '#334155' : '#94a3b8', fontSize:11, cursor: safePage === totalPages ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
                  Suivant ›
                </button>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
