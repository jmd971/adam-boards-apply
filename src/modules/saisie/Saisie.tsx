import { useState, useEffect } from 'react'
import { useAppStore } from '@/store'
import { sb } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import type { ManualEntry } from '@/types'

const CATEGORIES = [
  { cat: 'Vente',   subs: ['Vente marchandises','Prestation services','Location','Autre vente'], acc: '706' },
  { cat: 'Achat',   subs: ['Achat marchandises','Matières premières','Sous-traitance','Autre achat'], acc: '607' },
  { cat: 'Depense', subs: ['Loyer','Assurance','Téléphone','Carburant','Repas','Publicité','Autre charge'], acc: '626' },
]

export function Saisie() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const role    = useAppStore(s => s.role)
  const canEdit = role === 'admin' || role === 'editor'

  const [entries, setEntries] = useState<ManualEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)

  const [form, setForm] = useState({
    company_key: filters.selCo[0] ?? '',
    entry_date:  new Date().toISOString().slice(0,10),
    category:    'Vente' as ManualEntry['category'],
    subcategory: '',
    label:       '',
    amount_ttc:  '',
    amount_ht_saisie: '',
    tva_rate:    '20',
    counterpart: '',
    payment_mode: 'virement' as string,
  })

  useEffect(() => {
    sb.from('manual_entries').select('*').order('entry_date', { ascending: false }).limit(50)
      .then(({ data }) => { setEntries((data ?? []) as ManualEntry[]); setLoading(false) })
  }, [])

  const catConfig = CATEGORIES.find(c => c.cat === form.category)

  const handleSubmit = async () => {
    if (!form.amount_ttc || !form.entry_date) return
    setSaving(true)
    const ht = form.amount_ht_saisie || String(parseFloat(form.amount_ttc) / (1 + parseFloat(form.tva_rate)/100))
    const { data, error } = await sb.from('manual_entries').insert({
      ...form, amount_ht: ht,
      account_num: catConfig?.acc, source: 'manual',
    }).select().single()
    setSaving(false)
    if (error) { setMsg('❌ ' + error.message) }
    else { setEntries(p => [data as ManualEntry, ...p]); setMsg('✅ Entrée ajoutée'); setForm(f => ({ ...f, label:'', amount_ttc:'', amount_ht_saisie:'', counterpart:'' })) }
    setTimeout(() => setMsg(null), 3000)
  }

  const inputSt: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', fontSize: 12, width: '100%', outline: 'none', fontFamily: 'inherit' }

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding: '16px 24px', maxWidth: 900 }}>
      {canEdit && (
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Nouvelle saisie</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Société</label>
              <select value={form.company_key} onChange={e => setForm(f => ({...f, company_key: e.target.value}))} style={inputSt}>
                {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name || k}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({...f, entry_date: e.target.value}))} style={inputSt} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Catégorie</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value as any, subcategory: ''}))} style={inputSt}>
                {CATEGORIES.map(c => <option key={c.cat} value={c.cat}>{c.cat}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Sous-catégorie</label>
              <select value={form.subcategory} onChange={e => setForm(f => ({...f, subcategory: e.target.value}))} style={inputSt}>
                <option value="">— Choisir —</option>
                {catConfig?.subs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Montant TTC €</label>
              <input type="number" value={form.amount_ttc} onChange={e => setForm(f => ({...f, amount_ttc: e.target.value}))} style={inputSt} placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Montant HT € (opt.)</label>
              <input type="number" value={form.amount_ht_saisie} onChange={e => setForm(f => ({...f, amount_ht_saisie: e.target.value}))} style={inputSt} placeholder="Auto" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>TVA %</label>
              <select value={form.tva_rate} onChange={e => setForm(f => ({...f, tva_rate: e.target.value}))} style={inputSt}>
                {['0','8.5','10','20'].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Libellé</label>
              <input type="text" value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))} style={inputSt} placeholder="Description..." />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Contrepartie</label>
              <input type="text" value={form.counterpart} onChange={e => setForm(f => ({...f, counterpart: e.target.value}))} style={inputSt} placeholder="Fournisseur..." />
            </div>
            <div>
              <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 4 }}>Mode règlement</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({...f, payment_mode: e.target.value}))} style={inputSt}>
                {['virement','prelevement','cb','cheque','especes'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button onClick={handleSubmit} disabled={saving || !form.amount_ttc}
              style={{ padding: '8px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Enregistrement...' : '+ Ajouter'}
            </button>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{msg}</span>}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Historique</div>
      {loading ? <Spinner size={24} /> : entries.length === 0 ? (
        <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: 40 }}>Aucune saisie pour le moment.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.slice(0,30).map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
              <span style={{ color: '#475569', minWidth: 80 }}>{e.entry_date}</span>
              <span style={{ minWidth: 60, padding: '2px 7px', borderRadius: 20, background: e.category === 'Vente' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: e.category === 'Vente' ? '#10b981' : '#ef4444' }}>{e.category}</span>
              <span style={{ color: '#94a3b8', flex: 1 }}>{e.subcategory} {e.label ? '— ' + e.label : ''}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: e.category === 'Vente' ? '#10b981' : '#f1f5f9' }}>{parseFloat(e.amount_ttc).toLocaleString('fr-FR')} €</span>
              <span style={{ color: '#334155' }}>{e.payment_mode}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
