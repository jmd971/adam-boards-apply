import { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { sb } from '@/lib/supabase'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

export function Budget() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)
  const setBudData = useAppStore(s => s.setBudData)
  const role    = useAppStore(s => s.role)
  const canEdit = role === 'admin' || role === 'editor'

  const [budCo, setBudCo] = useState(filters.selCo[0] ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const coBud = useMemo(() => budData[budCo] ?? {}, [budData, budCo])

  const totals = useMemo(() => {
    const charges = Array(12).fill(0), produits = Array(12).fill(0)
    for (const [, v] of Object.entries(coBud)) {
      const bv = v as any
      bv.b?.forEach((val: number, i: number) => {
        if (bv.t === 'c') charges[i] += val
        else produits[i] += val
      })
    }
    return { charges, produits, result: produits.map((p, i) => p - charges[i]) }
  }, [coBud])

  const handleCell = (acc: string, fi: number, val: string) => {
    const num = parseFloat(val.replace(',', '.')) || 0
    const next = { ...budData, [budCo]: { ...coBud, [acc]: { ...(coBud[acc] as any), b: [...((coBud[acc] as any)?.b ?? Array(12).fill(0))] } } }
    ;(next[budCo][acc] as any).b[fi] = num
    setBudData(next as any)
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await sb.from('budget').upsert({ company_key: budCo, data: coBud, status: 'draft' }, { onConflict: 'company_key' })
    setSaving(false)
    setMsg(error ? '❌ Erreur de sauvegarde' : '✅ Budget sauvegardé')
    setTimeout(() => setMsg(null), 3000)
  }

  const accounts = Object.entries(coBud).sort(([a], [b]) => a.localeCompare(b))

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={budCo} onChange={e => setBudCo(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#cbd5e1', padding: '6px 10px', fontSize: 12 }}>
          {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name || k}</option>)}
        </select>
        {canEdit && <button onClick={handleSave} disabled={saving}
          style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}>
          {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
        </button>}
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{msg}</span>}
      </div>

      {accounts.length === 0 ? (
        <div style={{ padding: 24, borderRadius: 12, background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#475569', textAlign: 'center' }}>
          Aucun budget défini pour cette société.<br/>
          Importez un FEC puis revenez ici — le budget sera pré-rempli automatiquement.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, minWidth: 200, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Compte</th>
                {MONTHS_SHORT.map(m => <th key={m} style={{ padding: '8px 6px', textAlign: 'right', color: '#475569', fontWeight: 600, minWidth: 70, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{m}</th>)}
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#3b82f6', fontWeight: 700, minWidth: 85, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(([acc, v]) => {
                const bv = v as any
                const total = (bv.b ?? []).reduce((s: number, x: number) => s + x, 0)
                return (
                  <tr key={acc} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '4px 12px', color: '#94a3b8' }}>{acc} — {bv.l}</td>
                    {Array(12).fill(0).map((_, fi) => (
                      <td key={fi} style={{ padding: '2px 3px' }}>
                        <input type="number" value={bv.b?.[fi] ?? 0} disabled={!canEdit}
                          onChange={e => handleCell(acc, fi, e.target.value)}
                          style={{ width: 68, padding: '3px 5px', textAlign: 'right', background: canEdit ? 'rgba(255,255,255,0.04)' : 'transparent',
                            border: canEdit ? '1px solid rgba(255,255,255,0.06)' : 'none', borderRadius: 4, color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace' }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#8b5cf6', fontWeight: 600 }}>{fmt(total)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {[
                { label: 'Total produits', row: totals.produits, color: '#10b981' },
                { label: 'Total charges',  row: totals.charges,  color: '#ef4444' },
                { label: 'Résultat',       row: totals.result,   color: '#3b82f6' },
              ].map(({ label, row, color }) => (
                <tr key={label} style={{ background: 'rgba(255,255,255,0.02)', borderTop: '2px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 700, color, fontSize: 12 }}>{label}</td>
                  {row.map((v, i) => <td key={i} style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace', color, fontWeight: 600 }}>{fmt(v)}</td>)}
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color, fontWeight: 700 }}>{fmt(row.reduce((s,x) => s+x, 0))}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
