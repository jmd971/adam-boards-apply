import { useState, useEffect } from 'react'
import { useAppStore } from '@/store'
import { sb } from '@/lib/supabase'
import { OCR_PROXY_URL } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import type { ManualEntry } from '@/types'

const CATEGORIES = [
  { cat: 'Vente',   subs: ['Prestation de service','Vente de marchandise','Activité annexe','Autre vente'],              acc: '706' },
  { cat: 'Achat',   subs: ['Marchandises','Matières premières','Sous-traitance','Autre achat'],                           acc: '607' },
  { cat: 'Depense', subs: ['Loyer / Location','Abonnement logiciel','Téléphone / Internet','Assurance','Carburant',
                            'Entretien / Réparation','Fournitures bureau','Publicité','Déplacement / Mission',
                            'Honoraires comptable','Honoraires divers','Formation','Services bancaires',
                            'Salaires','Charges sociales','Impôts et taxes','Autre dépense'],                             acc: '626' },
]

const OCR_PROMPT = `Tu es un expert-comptable. Analyse cette facture et retourne UNIQUEMENT un JSON valide sans backticks ni markdown.
Champs requis:
1. date: date émission YYYY-MM-DD
2. amount_ttc: montant TTC (nombre décimal)
3. tva_rate: taux TVA (0 si absent, 8.5 DOM, 20 métropole)
4. category: Vente ou Achat ou Depense
5. subcategory: sous-catégorie précise
6. label: description courte
7. counterpart: nom fournisseur ou client

Répondre UNIQUEMENT avec: {"date":"YYYY-MM-DD","amount_ttc":0.00,"tva_rate":0,"category":"Depense","subcategory":"Autre dépense","label":"Description","counterpart":"Nom"}`

type Mode = 'manual' | 'ocr' | 'csv'

export function Saisie() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const [mode,    setMode]    = useState<Mode>('manual')
  const [entries, setEntries] = useState<ManualEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult,  setOcrResult]  = useState<string | null>(null)

  const [form, setForm] = useState({
    company_key:      filters.selCo[0] ?? '',
    entry_date:       new Date().toISOString().slice(0, 10),
    category:         'Vente' as ManualEntry['category'],
    subcategory:      '',
    label:            '',
    amount_ttc:       '',
    amount_ht_saisie: '',
    tva_rate:         '20',
    counterpart:      '',
    payment_mode:     'virement',
  })

  useEffect(() => {
    sb.from('manual_entries').select('*').order('entry_date', { ascending: false }).limit(50)
      .then(({ data }) => { setEntries((data ?? []) as ManualEntry[]); setLoading(false) })
  }, [])

  const catConfig = CATEGORIES.find(c => c.cat === form.category)

  // ── OCR ──────────────────────────────────────────────────────────────────
  const handleOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrLoading(true); setOcrResult(null); setMsg(null)

    try {
      const toBase64 = (f: File): Promise<string> => new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(f)
      })

      const isPdf = file.type === 'application/pdf'
      const base64 = await toBase64(file)
      const mediaType = file.type || 'image/jpeg'

      const messages = isPdf
        ? [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: OCR_PROMPT }
          ]}]
        : [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: OCR_PROMPT }
          ]}]

      const resp = await fetch(OCR_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await sb.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 500, messages }),
      })

      const raw = await resp.json()
      const text = raw?.content?.[0]?.text ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Réponse OCR invalide')

      const parsed = JSON.parse(jsonMatch[0])
      setOcrResult(`✅ Facture analysée : ${parsed.counterpart || ''} — ${parsed.amount_ttc} € TTC`)
      setForm(f => ({
        ...f,
        entry_date:  parsed.date || f.entry_date,
        category:    parsed.category || f.category,
        subcategory: parsed.subcategory || '',
        label:       parsed.label || '',
        amount_ttc:  String(parsed.amount_ttc || ''),
        tva_rate:    String(parsed.tva_rate || '20'),
        counterpart: parsed.counterpart || '',
      }))
      setMode('manual')
    } catch (err: any) {
      setMsg('❌ OCR : ' + (err.message || 'Erreur'))
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
      imported.push({
        company_key:  form.company_key,
        entry_date:   row.date || row.entry_date || '',
        category:     row.category || row.categorie || 'Depense',
        subcategory:  row.subcategory || row.sous_categorie || '',
        label:        row.label || row.libelle || '',
        amount_ttc:   row.amount_ttc || row.montant_ttc || '0',
        amount_ht:    row.amount_ht || row.montant_ht || '0',
        tva_rate:     row.tva_rate || row.tva || '20',
        counterpart:  row.counterpart || row.contrepartie || '',
        payment_mode: row.payment_mode || row.reglement || 'virement',
        source:       'csv',
      })
    }
    setSaving(true)
    const { data, error } = await sb.from('manual_entries').insert(imported).select()
    setSaving(false)
    if (error) setMsg('❌ ' + error.message)
    else { setEntries(p => [...(data as ManualEntry[]), ...p]); setMsg(`✅ ${data.length} lignes importées`) }
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Soumission manuelle ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.amount_ttc || !form.entry_date) return
    setSaving(true)
    const ht = form.amount_ht_saisie || '0'

    const { data, error } = await sb.from('manual_entries').insert({
      company_key:      form.company_key,
      entry_date:       form.entry_date,
      category:         form.category,
      subcategory:      form.subcategory,
      label:            form.label,
      amount_ttc:       form.amount_ttc,
      amount_ht:        ht,
      amount_ht_saisie: form.amount_ht_saisie,
      tva_rate:         form.tva_rate,
      counterpart:      form.counterpart,
      payment_mode:     form.payment_mode,
      account_num:      catConfig?.acc ?? '658',
      source:           'manual',
    }).select().single()

    setSaving(false)
    if (error) { setMsg('❌ ' + error.message) }
    else {
      setEntries(p => [data as ManualEntry, ...p])
      setMsg('✅ Entrée ajoutée')
      setForm(f => ({ ...f, label: '', amount_ttc: '', amount_ht_saisie: '', counterpart: '', subcategory: '' }))
    }
    setTimeout(() => setMsg(null), 3000)
  }

  const inputSt: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', fontSize: 12, width: '100%', outline: 'none', fontFamily: 'inherit',
  }

  const tabSt = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
    background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
    color: active ? '#93c5fd' : '#475569',
    boxShadow: active ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
  })

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding: '16px 24px', maxWidth: 900 }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setMode('manual')} style={tabSt(mode === 'manual')}>✏️ Saisie manuelle</button>
        <button onClick={() => setMode('ocr')}    style={tabSt(mode === 'ocr')}>   📷 Scanner (OCR)</button>
        <button onClick={() => setMode('csv')}    style={tabSt(mode === 'csv')}>   📄 Import CSV</button>
      </div>

      {/* OCR */}
      {mode === 'ocr' && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 24, border: '1px solid rgba(139,92,246,0.2)', marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#8b5cf6', marginBottom: 16 }}>
            {ocrLoading ? 'Analyse Claude AI en cours...' : 'Photographiez ou importez une facture'}
          </div>
          {ocrLoading
            ? <Spinner size={32} />
            : (
              <label style={{ padding: '10px 24px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', display: 'inline-block' }}>
                📷 Choisir une image ou PDF
                <input type="file" accept="image/*,.pdf" onChange={handleOCR} style={{ display: 'none' }} />
              </label>
            )
          }
          {ocrResult && <div style={{ marginTop: 12, fontSize: 12, color: '#10b981' }}>{ocrResult}<br/><span style={{ color: '#475569' }}>Formulaire pré-rempli → passez en Saisie manuelle</span></div>}
          <div style={{ marginTop: 16, fontSize: 11, color: '#334155' }}>Formats acceptés : JPG, PNG, PDF · Propulsé par Claude AI</div>
        </div>
      )}

      {/* CSV */}
      {mode === 'csv' && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 24, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#14b8a6', marginBottom: 8 }}>Import CSV</div>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 16 }}>Colonnes : date, category, subcategory, label, amount_ttc, tva_rate, counterpart, payment_mode</div>
          {saving
            ? <Spinner size={24} />
            : (
              <label style={{ padding: '10px 24px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(20,184,166,0.15)', color: '#14b8a6', border: '1px solid rgba(20,184,166,0.3)', display: 'inline-block' }}>
                📄 Choisir un fichier CSV
                <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: 'none' }} />
              </label>
            )
          }
          {msg && <div style={{ marginTop: 12, fontSize: 12, color: msg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{msg}</div>}
        </div>
      )}

      {/* Saisie manuelle */}
      {mode === 'manual' && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Nouvelle saisie</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Société</label>
              <select value={form.company_key} onChange={e => setForm(f => ({ ...f, company_key: e.target.value }))} style={inputSt}>
                {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name || k}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} style={inputSt} />
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Catégorie</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ManualEntry['category'], subcategory: '' }))} style={inputSt}>
                {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Sous-catégorie</label>
              <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} style={inputSt}>
                <option value="">— Choisir —</option>
                {catConfig?.subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Montant HT €</label>
              <input type="number" value={form.amount_ht_saisie} onChange={e => setForm(f => ({ ...f, amount_ht_saisie: e.target.value, amount_ttc: String(Math.round(parseFloat(e.target.value||'0') * (1 + parseFloat(form.tva_rate)/100) * 100)/100) }))} style={inputSt} placeholder="0.00" />
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>TVA % → TTC : {form.amount_ttc ? parseFloat(form.amount_ttc).toFixed(2) + ' €' : '—'}</label>
              <select value={form.tva_rate} onChange={e => setForm(f => ({ ...f, tva_rate: e.target.value }))} style={inputSt}>
                {['0','8.5','10','20'].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Libellé</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={inputSt} placeholder="Description..." />
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Contrepartie</label>
              <input type="text" value={form.counterpart} onChange={e => setForm(f => ({ ...f, counterpart: e.target.value }))} style={inputSt} placeholder="Fournisseur..." />
            </div>

            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Mode règlement</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))} style={inputSt}>
                {['virement','prelevement','cb','cheque','especes'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={handleSubmit} disabled={saving || !form.amount_ttc}
              style={{ padding: '8px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving || !form.amount_ttc ? 'not-allowed' : 'pointer', opacity: saving || !form.amount_ttc ? 0.6 : 1 }}>
              {saving ? 'Enregistrement...' : '+ Ajouter'}
            </button>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{msg}</span>}
          </div>
        </div>
      )}

      {/* Historique */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Historique</div>
      {loading ? <Spinner size={24} /> : entries.length === 0 ? (
        <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: 40 }}>Aucune saisie pour le moment.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.slice(0, 30).map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
              <span style={{ color: '#475569', minWidth: 80, flexShrink: 0 }}>{e.entry_date}</span>
              <span style={{ minWidth: 55, padding: '2px 6px', borderRadius: 20, flexShrink: 0, textAlign: 'center',
                background: e.category === 'Vente' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: e.category === 'Vente' ? '#10b981' : '#ef4444' }}>{e.category}</span>
              <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.subcategory}{e.label ? ' — ' + e.label : ''}
              </span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, flexShrink: 0, color: e.category === 'Vente' ? '#10b981' : '#f1f5f9' }}>
                {parseFloat(e.amount_ttc).toLocaleString('fr-FR')} €
              </span>
              <span style={{ color: '#8b5cf6', fontSize: 9, flexShrink: 0 }}>{e.source}</span>
              <span style={{ color: '#334155', flexShrink: 0 }}>{e.payment_mode}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
