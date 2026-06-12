import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { sb, OCR_PROXY_URL } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { buildRAW } from '@/lib/calc'
import { canWrite, type Role } from '@/lib/roles'
import type { ManualEntry } from '@/types'
import { useTenantId } from '@/store'
import { CATEGORIES, SUB_ALIASES, normSub, extractAcc } from '@/lib/categories'
import { CsvImportView, type CsvRow } from './CsvImportView'



const OCR_PROMPT = `Tu es un expert-comptable. Analyse cette facture et retourne UNIQUEMENT un JSON valide sans backticks ni markdown.
Champs requis:
1. date: date émission YYYY-MM-DD
2. amount_ttc: montant total TTC (nombre décimal)
3. amount_ht: montant total HT (nombre décimal)
4. category: Vente ou Achat ou Depense
5. subcategory: sous-catégorie précise
6. label: description courte
7. counterpart: nom fournisseur ou client
8. invoice_number: numéro de la facture (réf. facture / facture n° / invoice number). Chaîne vide "" si absent.

Répondre UNIQUEMENT avec: {"date":"YYYY-MM-DD","amount_ttc":0.00,"amount_ht":0.00,"category":"Depense","subcategory":"Autre dépense","label":"Description","counterpart":"Nom","invoice_number":"F2026-001"}`

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
  const setFilters     = useAppStore(s => s.setFilters)
  const manualEntries  = useAppStore(s => s.manualEntries)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)
  const isReadOnly     = !canWrite(role)
  
  const dataLoading    = useAppStore(s => s.dataLoading)

  const [mode,       setMode]       = useState<Mode>('manual')
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
  // Édition / suppression de saisies existantes
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // Montants HT par échéance (modifiables). Synchronisé sur echDates.length.
  // Si l'utilisateur n'a pas touché → on les recalcule en équitable à partir du HT.
  const [echAmounts,    setEchAmounts]    = useState<number[]>([])
  const [echAmountsDirty, setEchAmountsDirty] = useState(false)
  // Combobox sous-catégorie
  const [subSearch, setSubSearch] = useState('')
  const [subOpen,   setSubOpen]   = useState(false)

  const [form, setForm] = useState({
    company_key:  filters.selCo[0] ?? '',
    entry_date:   new Date().toISOString().slice(0, 10),
    category:     'Vente' as ManualEntry['category'],
    subcategory:  '',
    label:        '',
    invoice_number: '',
    amount_ttc:   '',
    amount_ht:    '',
    counterpart:  '',
    payment_mode: 'virement',
    payment_date: '',
  })

  // TVA calculée automatiquement
  const tvaAmount = form.amount_ht && form.amount_ttc
    ? calcTvaAmount(parseFloat(form.amount_ht), parseFloat(form.amount_ttc))
    : null
  const tvaRate = form.amount_ht && form.amount_ttc
    ? calcTvaRate(parseFloat(form.amount_ht), parseFloat(form.amount_ttc))
    : null

  const displayEntries = useMemo(() => {
    let result = manualEntries.filter(e => e.source !== 'echeance')
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
  }, [manualEntries, search, filterCat, sortCol, sortDir])

  const PAGE_SIZE = 20
  const pageCount = Math.ceil(displayEntries.length / PAGE_SIZE)
  const pageEntries = displayEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [search, filterCat])

  // Auto-sélectionner la première société si company_key est vide (quand selCo n'est pas filtré)
  useEffect(() => {
    if (!form.company_key && RAW?.keys?.length) {
      setForm(f => ({ ...f, company_key: filters.selCo[0] || RAW!.keys[0] }))
    }
  }, [RAW?.keys?.join(','), filters.selCo.join(',')])

  // Auto-recalcule les dates d'échéances quand les paramètres changent
  useEffect(() => {
    const start = echStartDate || form.entry_date
    if (!start) return
    setEchDates(calcEcheancierDates(start, echNb, echDelaiJours))
  }, [echStartDate, echNb, echDelaiJours, form.entry_date])

  // Auto-recalcule les montants équitables tant que l'utilisateur n'a pas saisi de répartition custom.
  // Dès qu'il édite un montant manuellement, on stoppe l'auto-calcul (echAmountsDirty=true).
  // Base : TTC (cash flow réel = TTC, pas HT).
  useEffect(() => {
    const ttc = parseFloat(form.amount_ttc || '0') || 0
    if (!echDates.length) { setEchAmounts([]); return }
    if (echAmountsDirty && echAmounts.length === echDates.length) return
    const part = Math.round((ttc / echDates.length) * 100) / 100
    const arr = Array(echDates.length).fill(part)
    const sum = part * echDates.length
    if (sum !== ttc) arr[arr.length - 1] = Math.round((ttc - part * (echDates.length - 1)) * 100) / 100
    setEchAmounts(arr)
  }, [echDates.length, form.amount_ttc, echAmountsDirty])

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'entry_date' ? 'desc' : 'asc') }
  }

  // ── Édition d'une saisie : charger dans le formulaire ───────────────────
  const handleEditFacture = (e: ManualEntry) => {
    setEditingId(String(e.id))
    setForm({
      company_key:  e.company_key || filters.selCo[0] || '',
      entry_date:   e.entry_date || new Date().toISOString().slice(0, 10),
      category:     e.category,
      subcategory:  e.subcategory || '',
      label:        e.label || '',
      invoice_number: (e as any).invoice_number || '',
      amount_ttc:   e.amount_ttc || '',
      amount_ht:    e.amount_ht || e.amount_ht_saisie || '',
      counterpart:  e.counterpart || '',
      payment_mode: e.payment_mode || 'virement',
      payment_date: e.payment_date || '',
    })
    setMode('manual')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setMsg('✏️ Modification en cours — éditez puis cliquez Enregistrer')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm(f => ({ ...f, label:'', invoice_number:'', amount_ttc:'', amount_ht:'', counterpart:'', subcategory:'', payment_date:'' })); setSubSearch('')
    setMsg(null)
  }

  // ── Suppression d'une saisie (et ses échéances/amortissements liés) ─────
  const handleDeleteFacture = async (id: string) => {
    if (!tenantId) return
    setSaving(true)
    // Supprimer les enfants (parent_id) puis la facture elle-même
    await sb.from('manual_entries').delete().eq('parent_id', id)
    const { error } = await sb.from('manual_entries').delete().eq('id', id)
    if (error) { setSaving(false); setMsg('❌ ' + error.message); return }

    // Mettre à jour le store + rebuild RAW pour que tous les modules se mettent à jour
    const newEntries = manualEntries.filter(en => String(en.id) !== id && (en as any).parent_id !== id)
    setManualEntries(newEntries)
    const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId)
    const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId)
    if (cd) setRAW(buildRAW(cd as any, (bd ?? []) as any, newEntries, fiscalSettings))

    setSaving(false)
    setConfirmDelete(null)
    setMsg('✅ Facture supprimée')
    setTimeout(() => setMsg(null), 3000)
  }
  const sortIcon = (col: typeof sortCol) =>
    sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  const catConfig = CATEGORIES.find(c => c.cat === form.category)

  // extractAcc importé depuis @/lib/categories

  // ── Suggestion de sous-catégorie — cascade à 3 niveaux ──────────────────
  // 1. Tiers déjà connu du FEC (N-1 prioritaire, puis N) → compte réellement utilisé
  // 2. Historique des saisies manuelles (tiers/libellé similaire)
  // 3. Mots-clés du libellé → plan comptable général (SUB_ALIASES)

  // Niveau 1 : compte le plus fréquemment utilisé pour ce tiers dans le FEC.
  // Recalculé uniquement quand le tiers/catégorie/société change (pas à chaque frappe du libellé).
  const fecSuggestion = useMemo(() => {
    const cpt = normSub((form.counterpart || '').trim())
    if (cpt.length < 3 || !RAW) return null
    const co = form.company_key || filters.selCo[0] || RAW.keys[0]
    if (!co) return null
    const cls = form.category === 'Vente' ? '7' : form.category === 'Immobilisation' ? '2' : '6'
    const counts: Record<string, number> = {}
    for (const field of ['p1', 'pn'] as const) {
      const data = (RAW.companies[co]?.[field] ?? {}) as Record<string, any>
      for (const [acc, acct] of Object.entries(data)) {
        if (!acc.startsWith(cls)) continue
        // Match sur le libellé du compte OU sur le libellé de chaque écriture
        const accLabelMatch = normSub(String((acct as any)?.l ?? '')).includes(cpt)
        for (const e of (((acct as any)?.e ?? []) as any[])) {
          const eLbl = normSub(String(e?.[1] ?? ''))
          if (accLabelMatch || eLbl.includes(cpt)) counts[acc] = (counts[acc] || 0) + 1
        }
      }
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (!best) return null
    // Compte → sous-catégorie : code entre parenthèses le plus long qui préfixe le compte
    const subs = catConfig?.subs ?? []
    let bestSub: string | null = null, bestLen = 0
    for (const sub of subs) {
      const code = extractAcc(sub, '')
      if (code && best[0].startsWith(code) && code.length > bestLen) { bestSub = sub; bestLen = code.length }
    }
    return bestSub ? { sub: bestSub, acc: best[0] } : null
  }, [form.counterpart, form.category, form.company_key, RAW, catConfig, filters.selCo])

  const suggestion = useMemo((): { sub: string; source: string } | null => {
    if (form.subcategory) return null
    // 1. Tiers connu du FEC → compte réellement utilisé en N-1/N
    if (fecSuggestion) return { sub: fecSuggestion.sub, source: `compte ${fecSuggestion.acc} déjà utilisé pour ce tiers` }
    const lbl = (form.label || '').toLowerCase().trim()
    const cpt = (form.counterpart || '').toLowerCase().trim()
    // 2. Libellé → plan comptable général via mots-clés
    const nl = normSub(lbl)
    if (nl.length >= 3) {
      for (const sub of (catConfig?.subs ?? [])) {
        if ((SUB_ALIASES[sub] ?? []).some(a => {
          const na = normSub(a)
          return nl.includes(na) || (nl.length >= 4 && na.includes(nl))
        })) return { sub, source: "d'après le libellé (plan comptable)" }
      }
    }
    // 3. Historique des saisies manuelles
    if (lbl || cpt) {
      const subs = catConfig?.subs ?? []
      const scores: Record<string, number> = {}
      for (const e of manualEntries) {
        if (e.category !== form.category || !e.subcategory) continue
        if (!subs.includes(e.subcategory)) continue
        const eLbl = (e.label || '').toLowerCase()
        const eCpt = (e.counterpart || '').toLowerCase()
        let score = 0
        if (cpt && eCpt && (cpt === eCpt || (cpt.length >= 3 && eCpt.includes(cpt)) || (eCpt.length >= 3 && cpt.includes(eCpt)))) score += 5
        if (lbl) {
          const tokens = lbl.split(/\s+/).filter(t => t.length >= 3)
          for (const t of tokens) {
            if (eLbl.includes(t) || eCpt.includes(t)) score += 1
          }
        }
        if (score > 0) scores[e.subcategory] = (scores[e.subcategory] || 0) + score
      }
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) return { sub: sorted[0][0], source: "d'après vos autres saisies" }
    }
    return null
  }, [form.label, form.counterpart, form.category, form.subcategory, manualEntries, catConfig, fecSuggestion])

  // Sous-catégories filtrées par la recherche libre (aliases inclus)
  const filteredSubs = useMemo(() => {
    const all = catConfig?.subs ?? []
    const q = normSub(subSearch.trim())
    if (!q) return all
    return all.filter(sub => {
      if (normSub(sub).includes(q)) return true
      return (SUB_ALIASES[sub] ?? []).some(alias => normSub(alias).includes(q) || q.includes(normSub(alias)))
    })
  }, [subSearch, catConfig])

  // ── Rafraîchir le store après saisie ─────────────────────────────────────
  const refreshStore = async (newEntry: ManualEntry) => {
    const allEntries = [newEntry, ...manualEntries]
    setManualEntries(allEntries)
    if (!tenantId) return
    const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId)
    const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId)
    if (cd) {
      const newRAW = buildRAW(cd as any, (bd ?? []) as any, allEntries, fiscalSettings)
      setRAW(newRAW)
      // Étendre la période pour inclure le mois de la nouvelle entrée
      if (newRAW.mn.length > 0) {
        const newStart = newRAW.mn[0]
        const newEnd   = newRAW.mn[newRAW.mn.length - 1]
        setFilters({
          startM: (!filters.startM || newStart < filters.startM) ? newStart : filters.startM,
          endM:   (!filters.endM   || newEnd   > filters.endM)   ? newEnd   : filters.endM,
        })
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

      // Trouver la sous-catégorie prédéfinie la plus proche de la réponse OCR
      // (le texte OCR libre n'a pas le format "(623)" → extractAcc échouerait)
      const ocrCat   = (parsed.category || 'Depense') as ManualEntry['category']
      const ocrSub   = (parsed.subcategory || '').toLowerCase().trim()
      const catSubs  = CATEGORIES.find(c => c.cat === ocrCat)?.subs ?? []
      const matchedSub = ocrSub.length >= 3
        ? catSubs.find(s => {
            const label = s.split('(')[0].trim().toLowerCase()
            return label.includes(ocrSub.slice(0, 8)) || ocrSub.includes(label.slice(0, 6))
          })
        : undefined

      setOcrResult(`✅ Facture analysée : ${parsed.counterpart || ''} — HT: ${ht.toFixed(2)} € | TTC: ${ttc.toFixed(2)} € | TVA: ${calcTvaAmount(ht, ttc).toFixed(2)} €`)
      setForm(f => ({
        ...f,
        entry_date:  parsed.date || f.entry_date,
        category:    ocrCat,
        subcategory: matchedSub || parsed.subcategory || '',
        label:       parsed.label || '',
        invoice_number: (parsed as any).invoice_number || (parsed as any).numero_facture || f.invoice_number,
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
  // ── Import CSV via CsvImportView ─────────────────────────────────────────
  const handleCsvImport = async (companyKey: string, rows: CsvRow[]) => {
    setMsg(null)
    const imported = rows.map(r => {
      const ht  = r.amount_ht
      const ttc = r.amount_ttc || ht
      return {
        tenant_id:     tenantId,
        company_key:   companyKey,
        entry_date:     r.date,
        category:       r.category,
        subcategory:    r.subcategory,
        label:          r.label,
        invoice_number: r.invoice_number || null,
        amount_ttc:     String(ttc),
        amount_ht:      String(ht),
        tva_amount:     r.tva_amount > 0 ? String(r.tva_amount) : String(calcTvaAmount(ht, ttc)),
        tva_rate:       r.tva_rate  || calcTvaRate(ht, ttc),
        counterpart:    r.counterpart,
        payment_mode:   r.payment_mode || 'virement',
        payment_date:   r.payment_date || null,
        account_num:    extractAcc(r.subcategory, CATEGORIES.find(c => c.cat === r.category)?.acc ?? '658'),
        source:         'csv' as const,
      }
    })
    setSaving(true)
    const { data, error } = await sb.from('manual_entries').insert(imported).select()
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }
    const newEntries = data as ManualEntry[]
    setMsg(`✅ ${newEntries.length} lignes importées`)
    const allEntries = [...newEntries, ...manualEntries]
    setManualEntries(allEntries)
    if (tenantId) {
      const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId)
      const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId)
      if (cd) {
        const newRAW = buildRAW(cd as any, (bd ?? []) as any, allEntries, fiscalSettings)
        setRAW(newRAW)
        if (newRAW.mn.length > 0) {
          setFilters({
            startM: (!filters.startM || newRAW.mn[0] < filters.startM) ? newRAW.mn[0] : filters.startM,
            endM:   (!filters.endM   || newRAW.mn[newRAW.mn.length-1] > filters.endM) ? newRAW.mn[newRAW.mn.length-1] : filters.endM,
          })
        }
      }
    }
    setTimeout(() => setMsg(null), 5000)
  }

  // ── Soumission manuelle ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    const companyKeyCheck = form.company_key || filters.selCo[0] || RAW?.keys[0] || ''
    if (!form.amount_ht || !form.entry_date) return
    if (!companyKeyCheck) { setMsg('❌ Indiquez le nom de la société'); return }
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

    const companyKey = form.company_key || filters.selCo[0] || RAW?.keys[0] || ''

    const payload = {
      tenant_id:    tenantId,
      company_key:  companyKey,
      entry_date:   form.entry_date,
      category:     form.category,
      subcategory:  form.subcategory,
      label:        form.label,
      invoice_number: form.invoice_number || null,
      amount_ttc:   String(ttc),
      amount_ht:    String(ht),
      amount_ht_saisie: String(ht),
      tva_amount:   String(tvaAmt),
      tva_rate:     tvaRte,
      counterpart:  form.counterpart,
      payment_mode: form.payment_mode,
      payment_date: !isEch && form.payment_date ? form.payment_date : null,
      account_num:  extractAcc(form.subcategory, catConfig?.acc ?? '658'),
      source:       (editingId ? 'manual' : (ocrFile ? 'ocr' : 'manual')) as 'manual' | 'ocr',
      ...(invoiceUrl ? { invoice_url: invoiceUrl } : {}),
      ...(isEch ? {
        echeancier_data: {
          nb: echNb,
          delai_jours: echDelaiJours,
          dates,
          // amounts uniquement si l'utilisateur a personnalisé. Sinon on laisse
          // Trésorerie répartir équitablement (rétro-compatible avec saisies anciennes).
          ...(echAmountsDirty && echAmounts.length === dates.length
              ? { amounts: echAmounts }
              : {}),
        },
      } : { echeancier_data: null }),
    }

    const { data, error } = editingId
      ? await sb.from('manual_entries').update(payload).eq('id', editingId).select().single()
      : await sb.from('manual_entries').insert(payload).select().single()

    setSaving(false)
    if (error) { setMsg('❌ ' + error.message); return }

    const newEntry = data as ManualEntry
    const wasEditing = !!editingId
    setMsg(wasEditing ? '✅ Facture modifiée — mise à jour des tableaux en cours...' : '✅ Entrée ajoutée — mise à jour des tableaux en cours...')

    if (wasEditing) {
      // Remplacer dans le store (pas de prepend, sinon doublon)
      const updated = manualEntries.map(en => String(en.id) === editingId ? newEntry : en)
      setManualEntries(updated)
      if (tenantId) {
        const { data: cd } = await sb.from('company_data').select('*').eq('tenant_id', tenantId)
        const { data: bd } = await sb.from('budget').select('*').eq('tenant_id', tenantId)
        if (cd) setRAW(buildRAW(cd as any, (bd ?? []) as any, updated, fiscalSettings))
      }
    } else {
      await refreshStore(newEntry)
    }

    setMsg(wasEditing ? '✅ Facture modifiée et tableaux mis à jour' : '✅ Entrée ajoutée et tableaux mis à jour')
    setEditingId(null)
    setForm(f => ({ ...f, label:'', invoice_number:'', amount_ttc:'', amount_ht:'', counterpart:'', subcategory:'', payment_date:'' })); setSubSearch('')
    setEchDates([])
    setEchAmounts([])
    setEchAmountsDirty(false)
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
    color:      active ? '#93c5fd' : '#94a3b8',
    boxShadow:  active ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
  })

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding:'16px 24px' }}>

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
              <span style={{ color:'#94a3b8' }}>Formulaire pré-rempli → passez en Saisie manuelle</span>
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

      {/* CSV — import avec prévisualisation et affectation */}
      {mode === 'csv' && (
        <>
          <CsvImportView
            companyKeys={RAW?.keys?.length > 0 ? RAW.keys : (form.company_key ? [form.company_key] : [''])}
            defaultCompanyKey={form.company_key || filters.selCo[0] || RAW?.keys[0] || ''}
            companyNames={Object.fromEntries((RAW?.keys ?? []).map(k => [k, RAW.companies[k]?.name || k]))}
            onImport={handleCsvImport}
            saving={saving}
          />
          {msg && <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, fontSize:12, background: msg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: msg.startsWith('✅') ? '#10b981' : '#ef4444', border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>{msg}</div>}
        </>
      )}

      {/* Saisie manuelle */}
      {mode === 'manual' && (
        <div style={{ background:'#0f172a', borderRadius:12, padding:20, border:'1px solid rgba(255,255,255,0.06)', marginBottom:24 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#f1f5f9', marginBottom:16 }}>Nouvelle saisie</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:10 }}>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Société</label>
              {RAW.keys.length > 0
                ? (
                  <select value={form.company_key} onChange={e => setForm(f => ({...f, company_key:e.target.value}))} style={inputSt}>
                    {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name||k}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.company_key}
                    onChange={e => setForm(f => ({...f, company_key: e.target.value.trim().toUpperCase().replace(/\s+/g,'_')}))}
                    style={inputSt}
                    placeholder="Ex : STE_COMMERCIALE"
                  />
                )
              }
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({...f, entry_date:e.target.value}))} style={inputSt} />
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Catégorie</label>
              <select value={form.category} onChange={e => {
                setForm(f => ({...f, category:e.target.value as ManualEntry['category'], subcategory:''}))
                setSubSearch('')
              }} style={inputSt}>
                {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
              </select>
            </div>

            {/* ── Sous-catégorie : combobox avec recherche libre ── */}
            <div style={{ position:'relative' }}>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>
                Sous-catégorie
                {form.subcategory && <span style={{ marginLeft:6, color:'#22c55e', fontSize:9 }}>✓ sélectionnée</span>}
              </label>
              <div style={{ position:'relative' }}>
                <input
                  type="text"
                  value={subOpen ? subSearch : (form.subcategory || subSearch)}
                  placeholder="Taper : loyer, assurance, téléphone, salaire…"
                  onChange={e => { setSubSearch(e.target.value); setSubOpen(true); if (!e.target.value) setForm(f => ({...f, subcategory:''})) }}
                  onFocus={() => { setSubSearch(''); setSubOpen(true) }}
                  onBlur={() => setTimeout(() => setSubOpen(false), 160)}
                  style={{ ...inputSt, color: !subOpen && form.subcategory ? '#93c5fd' : undefined, paddingRight: 28 }}
                />
                {/* Indicateur : flèche si fermé, croix si valeur sélectionnée */}
                <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', fontSize:10, color:'#94a3b8', pointerEvents: form.subcategory ? 'auto' : 'none', cursor: form.subcategory ? 'pointer' : 'default' }}
                  onMouseDown={e => { e.preventDefault(); setForm(f => ({...f, subcategory:''})); setSubSearch('') }}>
                  {form.subcategory ? '✕' : '▾'}
                </span>
              </div>
              {/* Dropdown */}
              {subOpen && (
                <div style={{
                  position:'absolute', top:'calc(100% + 2px)', left:0, right:0, zIndex:200,
                  background:'#0f172a', border:'1px solid rgba(255,255,255,0.15)',
                  borderRadius:8, maxHeight:220, overflowY:'auto',
                  boxShadow:'0 8px 28px rgba(0,0,0,0.5)',
                }}>
                  {filteredSubs.length === 0 ? (
                    <div style={{ padding:'10px 14px', fontSize:11, color:'#94a3b8', fontStyle:'italic' }}>
                      Aucune correspondance — essayez un autre mot
                    </div>
                  ) : filteredSubs.map(sub => (
                    <div key={sub}
                      onMouseDown={() => { setForm(f => ({...f, subcategory:sub})); setSubSearch(''); setSubOpen(false) }}
                      style={{
                        padding:'9px 12px', cursor:'pointer', fontSize:12,
                        color: sub === form.subcategory ? '#93c5fd' : '#cbd5e1',
                        background: sub === form.subcategory ? 'rgba(59,130,246,0.18)' : 'transparent',
                        borderBottom:'1px solid rgba(255,255,255,0.04)',
                        transition:'background 0.1s',
                      }}
                      onMouseEnter={e => { if (sub !== form.subcategory) e.currentTarget.style.background='rgba(255,255,255,0.07)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = sub === form.subcategory ? 'rgba(59,130,246,0.18)' : 'transparent' }}
                    >
                      {sub}
                    </div>
                  ))}
                </div>
              )}
              {/* Suggestion : FEC N-1 → historique saisies → libellé/PCG */}
              {!subOpen && suggestion && suggestion.sub !== form.subcategory && (
                <div style={{ marginTop:4, fontSize:10.5, color:'#94a3b8', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span>💡 {suggestion.source} :</span>
                  <button type="button"
                    onClick={() => { setForm(f => ({ ...f, subcategory: suggestion.sub })); setSubSearch('') }}
                    style={{ background:'rgba(59,130,246,0.15)', border:'1px solid rgba(59,130,246,0.3)', color:'#93c5fd', cursor:'pointer', padding:'2px 8px', borderRadius:4, fontSize:10.5, fontWeight:600 }}>
                    {suggestion.sub}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Montant HT € *</label>
              <input type="number" step="0.01" value={form.amount_ht}
                onChange={e => setForm(f => ({...f, amount_ht:e.target.value}))}
                style={inputSt} placeholder="0.00" />
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Montant TTC €</label>
              <input type="number" step="0.01" value={form.amount_ttc}
                onChange={e => setForm(f => ({...f, amount_ttc:e.target.value}))}
                style={inputSt} placeholder="= HT si vide" />
            </div>

            {/* TVA calculée automatiquement */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>TVA (calculée)</label>
              <div style={{ ...inputSt, display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
                <span style={{ fontFamily:'monospace', color: tvaAmount !== null ? '#f59e0b' : '#334155' }}>
                  {tvaAmount !== null ? `${tvaAmount.toFixed(2)} €` : '—'}
                </span>
                <span style={{ fontSize:10, color:'#94a3b8' }}>
                  {tvaRate ? `(${parseFloat(tvaRate).toFixed(1)} %)` : ''}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Libellé</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({...f, label:e.target.value}))} style={inputSt} placeholder="Description..." />
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>N° de facture</label>
              <input type="text" value={form.invoice_number} onChange={e => setForm(f => ({...f, invoice_number:e.target.value}))} style={inputSt} placeholder="Ex : F2026-001" />
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Contrepartie</label>
              <input type="text" value={form.counterpart} onChange={e => setForm(f => ({...f, counterpart:e.target.value}))} style={inputSt} placeholder="Fournisseur..." />
            </div>

            <div>
              <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Mode règlement</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({...f, payment_mode:e.target.value}))} style={inputSt}>
                {['comptant','virement','prelevement','cb','cheque','especes','echeancier'].map(m => (
                  <option key={m} value={m}>{m === 'echeancier' ? 'Paiement échelonné' : m}</option>
                ))}
              </select>
            </div>

            {/* Date de paiement pour les modes non-échelonnés */}
            {form.payment_mode !== 'echeancier' && (
              <div>
                <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Date de paiement</label>
                <input type="date" value={form.payment_date}
                  onChange={e => setForm(f => ({...f, payment_date:e.target.value}))}
                  style={inputSt} placeholder="Optionnel" />
              </div>
            )}

            {/* Écheancier : dates libres */}
            {form.payment_mode === 'echeancier' && (
              <>
                <div>
                  <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>1ère échéance</label>
                  <input type="date" value={echStartDate || form.entry_date}
                    onChange={e => setEchStartDate(e.target.value)} style={inputSt} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Nb d'échéances</label>
                  <input type="number" min={1} max={60} value={echNb}
                    onChange={e => setEchNb(Math.max(1, Math.min(60, Number(e.target.value))))}
                    style={inputSt} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'#94a3b8', display:'block', marginBottom:4 }}>Délai entre chaque (jours)</label>
                  <input type="number" min={1} max={365} value={echDelaiJours}
                    onChange={e => setEchDelaiJours(Math.max(1, Math.min(365, Number(e.target.value))))}
                    style={inputSt} />
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label style={{ fontSize:10, color:'#94a3b8' }}>Échéances (date et montant modifiables)</label>
                    {echAmountsDirty && (
                      <button type="button" onClick={() => setEchAmountsDirty(false)}
                        style={{ background:'rgba(99,102,241,0.15)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.3)',
                          borderRadius:6, padding:'3px 10px', fontSize:10, cursor:'pointer' }}>
                        Répartir équitablement
                      </button>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'flex-end' }}>
                    {echDates.map((d, i) => (
                      <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <span style={{ fontSize:9, color:'#94a3b8' }}>Échéance {i + 1}</span>
                        <input type="date" value={d}
                          onChange={e => setEchDates(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                          style={{ ...inputSt, width:130, fontSize:11, padding:'4px 6px' }} />
                        <input type="number" step="0.01" min={0} value={echAmounts[i] ?? 0}
                          onChange={e => {
                            const v = parseFloat(e.target.value) || 0
                            setEchAmounts(prev => prev.map((x, j) => j === i ? v : x))
                            setEchAmountsDirty(true)
                          }}
                          style={{ ...inputSt, width:130, fontSize:11, padding:'4px 6px', textAlign:'right' }} />
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const ttc = parseFloat(form.amount_ttc || '0') || 0
                    const sum = echAmounts.reduce((s, v) => s + v, 0)
                    const diff = Math.round((sum - ttc) * 100) / 100
                    if (!ttc || !echAmounts.length) return null
                    return (
                      <div style={{ fontSize:10, marginTop:6, color: Math.abs(diff) < 0.01 ? '#10b981' : '#f59e0b' }}>
                        Total échéances : {sum.toFixed(2)} € TTC / TTC facture : {ttc.toFixed(2)} €
                        {Math.abs(diff) >= 0.01 && <span> — écart {diff > 0 ? '+' : ''}{diff.toFixed(2)} €</span>}
                      </div>
                    )
                  })()}
                </div>
              </>
            )}

          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:14 }}>
            <button onClick={handleSubmit} disabled={saving || !form.amount_ht || isReadOnly}
              style={{ padding:'8px 20px', borderRadius:8,
                background: editingId ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                border:'none', color:'#fff', fontSize:12, fontWeight:600,
                cursor: saving||!form.amount_ht ? 'not-allowed':'pointer',
                opacity: saving||!form.amount_ht ? 0.6:1 }}>
              {saving ? 'Enregistrement...' : (editingId ? '💾 Enregistrer modifications' : '+ Ajouter')}
            </button>
            {editingId && (
              <button onClick={handleCancelEdit} disabled={saving}
                style={{ padding:'8px 16px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'#94a3b8', fontSize:12, fontWeight:500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                Annuler
              </button>
            )}
            {msg && <span style={{ fontSize:12, color: msg.startsWith('✅') ? '#10b981':'#ef4444' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Historique */}
      <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Historique</div>

      {/* Recherche + filtres */}
      {!dataLoading && manualEntries.filter(e => e.source !== 'echeance').length > 0 && (
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
                  color: active ? accent : '#94a3b8',
                }}>{cat}</button>
              )
            })}
          </div>
          <span style={{ fontSize:10, color:'#334155', marginLeft:4 }}>
            {displayEntries.length} résultat{displayEntries.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {dataLoading ? <Spinner size={24} /> : manualEntries.filter(e => e.source !== 'echeance').length === 0 ? (
        <div style={{ fontSize:12, color:'#334155', textAlign:'center', padding:40 }}>Aucune saisie pour le moment.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:'#0f172a' }}>
                {([
                  { label:'Date facture',         col:'entry_date'  as const, align:'left'  },
                  { label:'Dt paiement',          col:null,                   align:'left'  },
                  { label:'Société',              col:null,                   align:'left'  },
                  { label:'Pièce',               col:null,                   align:'left'  },
                  { label:'Catégorie',           col:null,                   align:'left'  },
                  { label:'Sous-cat. / Libellé', col:null,                   align:'left'  },
                  { label:'Contrepartie',        col:'counterpart' as const, align:'left'  },
                  { label:'HT €',                col:'amount_ht'   as const, align:'right' },
                  { label:'TVA €',               col:null,                   align:'right' },
                  { label:'TTC €',               col:'amount_ttc'  as const, align:'right' },
                  { label:'Règlement',            col:null,                   align:'left'  },
                  { label:'Source',               col:null,                   align:'left'  },
                  { label:'Actions',              col:null,                   align:'center'  },
                ] as { label:string; col:'entry_date'|'amount_ht'|'amount_ttc'|'counterpart'|null; align:string }[]).map(({ label, col, align }) => (
                  <th key={label} onClick={col ? () => handleSort(col) : undefined} style={{
                    padding:'6px 8px', textAlign: align as 'left'|'right',
                    color: col && sortCol === col ? '#93c5fd' : '#94a3b8',
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
                    <td style={{ padding:'6px 8px', color:'#94a3b8', whiteSpace:'nowrap' }}>{fmtDate(e.entry_date)}</td>
                    <td style={{ padding:'6px 8px', color: e.payment_date ? '#10b981' : '#334155', whiteSpace:'nowrap', fontSize:11 }}>
                      {e.payment_mode === 'echeancier'
                        ? <span style={{ color:'#8b5cf6', fontSize:10 }}>échelonné</span>
                        : e.payment_date ? fmtDate(e.payment_date) : <span style={{ color:'#334155' }}>—</span>}
                    </td>
                    <td style={{ padding:'6px 8px', whiteSpace:'nowrap', fontSize:11 }}>
                      <span style={{ color:'#60a5fa', fontWeight:500 }}>
                        {RAW.companies[e.company_key]?.name || e.company_key || '—'}
                      </span>
                    </td>
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
                    <td style={{ padding:'6px 8px', fontSize:10, whiteSpace:'nowrap', textAlign:'center' }}>
                      {confirmDelete === String(e.id) ? (
                        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                          <button onClick={() => handleDeleteFacture(String(e.id))} disabled={isReadOnly || saving}
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
                            style={{ padding:'3px 8px', borderRadius:5, border:'1px solid rgba(59,130,246,0.3)', background:'rgba(59,130,246,0.08)', color:'#60a5fa', fontSize:11, cursor: isReadOnly ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
                            ✏️
                          </button>
                          <button onClick={() => setConfirmDelete(String(e.id))} disabled={isReadOnly}
                            title="Supprimer"
                            style={{ padding:'3px 8px', borderRadius:5, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#f87171', fontSize:11, cursor: isReadOnly ? 'not-allowed' : 'pointer', fontFamily:'inherit' }}>
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px 0', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page===0?'#1e293b':'#94a3b8', cursor: page===0?'default':'pointer', fontSize:11 }}>«</button>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page===0?'#1e293b':'#94a3b8', cursor: page===0?'default':'pointer', fontSize:11 }}>‹</button>
              <span style={{ fontSize:11, color:'#94a3b8' }}>Page {page+1} / {pageCount} — {displayEntries.length} entrée{displayEntries.length>1?'s':''}</span>
              <button onClick={() => setPage(p => Math.min(pageCount-1, p+1))} disabled={page >= pageCount-1} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page>=pageCount-1?'#1e293b':'#94a3b8', cursor: page>=pageCount-1?'default':'pointer', fontSize:11 }}>›</button>
              <button onClick={() => setPage(pageCount-1)} disabled={page >= pageCount-1} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color: page>=pageCount-1?'#1e293b':'#94a3b8', cursor: page>=pageCount-1?'default':'pointer', fontSize:11 }}>»</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
