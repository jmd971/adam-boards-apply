import { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, fiscalIndex } from '@/lib/calc'
import { sb } from '@/lib/supabase'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

export function Budget() {
  const RAW        = useAppStore(s => s.RAW)
  const filters    = useAppStore(s => s.filters)
  const budData    = useAppStore(s => s.budData)
  const setBudData = useAppStore(s => s.setBudData)

  const [budCo,   setBudCo]   = useState(filters.selCo[0] ?? '')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<string | null>(null)
  const [filter,  setFilter]  = useState<'all' | 'charge' | 'produit'>('all')
  const [search,  setSearch]  = useState('')

  const coBud = useMemo(() => (budData[budCo] ?? {}) as Record<string, any>, [budData, budCo])

  // Générer le budget depuis FEC N-1
  const handleGenerate = () => {
    if (!RAW) return
    const co = budCo
    const p1 = RAW.companies[co]?.p1 ?? {}
    const pn = RAW.companies[co]?.pn ?? {}
    const newBud: Record<string, any> = { ...coBud }

    const sources = [p1, pn]
    for (const src of sources) {
      for (const [acc, data] of Object.entries(src)) {
        if (!acc.startsWith('6') && !acc.startsWith('7')) continue
        if (newBud[acc]) continue  // ne pas écraser l'existant
        const isCharge = acc.startsWith('6')
        const b = Array(12).fill(0)
        const moMap = (data as any)?.mo ?? {}
        for (const [month, vals] of Object.entries(moMap)) {
          const fi = fiscalIndex(month)
          if (fi < 0 || fi > 11) continue
          const [d, cr] = vals as [number, number]
          b[fi] = Math.round(Math.abs(isCharge ? d - cr : cr - d))
        }
        if (b.some(v => v > 0)) {
          newBud[acc] = { b, t: isCharge ? 'c' : 'p', l: (data as any)?.l || acc }
        }
      }
    }

    setBudData({ ...budData, [co]: newBud } as any)
    setMsg('✅ Budget généré depuis N-1 — pensez à sauvegarder')
    setTimeout(() => setMsg(null), 4000)
  }

  const handleCell = (acc: string, fi: number, val: string) => {
    const num = parseFloat(val.replace(',', '.')) || 0
    const cur = coBud[acc] ?? { b: Array(12).fill(0), t: 'c', l: acc }
    const newB = [...(cur.b ?? Array(12).fill(0))]
    newB[fi] = num
    setBudData({ ...budData, [budCo]: { ...coBud, [acc]: { ...cur, b: newB } } } as any)
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await sb.from('budget').upsert(
      { company_key: budCo, data: coBud, status: 'draft' },
      { onConflict: 'company_key' }
    )
    setSaving(false)
    setMsg(error ? '❌ ' + error.message : '✅ Budget sauvegardé')
    setTimeout(() => setMsg(null), 3000)
  }

  const totals = useMemo(() => {
    const charges = Array(12).fill(0), produits = Array(12).fill(0)
    for (const v of Object.values(coBud)) {
      const bv = v as any
      bv.b?.forEach((val: number, i: number) => {
        if (bv.t === 'c') charges[i] += val
        else produits[i] += val
      })
    }
    return { charges, produits, result: produits.map((p, i) => p - charges[i]) }
  }, [coBud])

  const accounts = useMemo(() => {
    return Object.entries(coBud)
      .filter(([acc, v]) => {
        const bv = v as any
        if (filter === 'charge'  && bv.t !== 'c') return false
        if (filter === 'produit' && bv.t !== 'p') return false
        if (search && !acc.includes(search) && !(bv.l as string)?.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort(([a], [b]) => a.localeCompare(b))
  }, [coBud, filter, search])

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>
  )

  const inputSt: React.CSSProperties = {
    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#cbd5e1', padding: '6px 10px', fontSize: 12, outline: 'none',
  }

  return (
    <div style={{ padding: '16px 24px' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>

        <select value={budCo} onChange={e => setBudCo(e.target.value)} style={inputSt}>
          {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name || k}</option>)}
        </select>

        <input
          type="text" placeholder="Rechercher un compte..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, width: 200 }}
        />

        <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)' }}>
          {(['all','charge','produit'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:'6px 10px', fontSize:11, fontWeight:600, border:'none', cursor:'pointer',
                background: filter===f ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: filter===f ? '#93c5fd' : '#475569' }}>
              {f==='all' ? 'Tous' : f==='charge' ? '📤 Charges' : '📥 Produits'}
            </button>
          ))}
        </div>

        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {Object.keys(coBud).length === 0 && (
            <button onClick={handleGenerate}
              style={{ padding:'6px 14px', borderRadius:8, background:'rgba(245,158,11,0.2)', border:'1px solid rgba(245,158,11,0.3)', color:'#f59e0b', fontSize:12, cursor:'pointer', fontWeight:600 }}>
              ⚡ Générer depuis FEC N-1
            </button>
          )}
          {Object.keys(coBud).length > 0 && (
            <button onClick={handleGenerate}
              style={{ padding:'6px 14px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'#475569', fontSize:12, cursor:'pointer' }}>
              🔄 Régénérer
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            style={{ padding:'6px 14px', borderRadius:8, background:'rgba(59,130,246,0.2)', border:'1px solid rgba(59,130,246,0.3)', color:'#93c5fd', fontSize:12, cursor:'pointer', fontWeight:600 }}>
            {saving ? 'Sauvegarde...' : '💾 Sauvegarder'}
          </button>
        </div>

        {msg && <span style={{ fontSize:12, color: msg.startsWith('✅') ? '#10b981':'#ef4444', width:'100%' }}>{msg}</span>}
      </div>

      {accounts.length === 0 && Object.keys(coBud).length === 0 ? (
        <div style={{ padding:32, borderRadius:12, background:'#0f172a', border:'1px solid rgba(255,255,255,0.06)', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>💰</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9', marginBottom:8 }}>Aucun budget défini</div>
          <div style={{ fontSize:12, color:'#475569', marginBottom:20 }}>
            Cliquez sur <strong style={{ color:'#f59e0b' }}>⚡ Générer depuis FEC N-1</strong> pour pré-remplir automatiquement<br/>
            le budget à partir des données de l'exercice précédent.
          </div>
          <button onClick={handleGenerate}
            style={{ padding:'10px 24px', borderRadius:10, background:'linear-gradient(135deg,#f59e0b,#f97316)', border:'none', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            ⚡ Générer le budget depuis N-1
          </button>
        </div>
      ) : (
        <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid rgba(255,255,255,0.06)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#0a0f1a', position:'sticky', top:0, zIndex:5 }}>
                <th style={{ padding:'8px 12px', textAlign:'left', color:'#475569', fontWeight:600, minWidth:200, borderBottom:'1px solid rgba(255,255,255,0.08)', position:'sticky', left:0, background:'#0a0f1a', zIndex:7 }}>Compte</th>
                <th style={{ padding:'8px 8px', textAlign:'center', color:'#475569', fontWeight:600, width:60, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>Type</th>
                {MONTHS_SHORT.map(m => (
                  <th key={m} style={{ padding:'8px 4px', textAlign:'right', color:'#475569', fontWeight:600, minWidth:68, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{m}</th>
                ))}
                <th style={{ padding:'8px 10px', textAlign:'right', color:'#3b82f6', fontWeight:700, minWidth:85, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(([acc, v]) => {
                const bv = v as any
                const total = (bv.b ?? []).reduce((s: number, x: number) => s + x, 0)
                const isCharge = bv.t === 'c'
                return (
                  <tr key={acc} style={{ borderBottom:'1px solid rgba(255,255,255,0.025)' }}>
                    <td style={{ padding:'3px 12px', color:'#94a3b8', position:'sticky', left:0, background:'#080d1a', zIndex:1, whiteSpace:'nowrap' }}>
                      <span style={{ fontFamily:'monospace', color:'#475569', marginRight:6 }}>{acc}</span>
                      <span>{bv.l}</span>
                    </td>
                    <td style={{ padding:'3px 8px', textAlign:'center' }}>
                      <span style={{ fontSize:10, padding:'1px 5px', borderRadius:10,
                        background: isCharge ? 'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)',
                        color: isCharge ? '#ef4444':'#10b981' }}>
                        {isCharge ? 'charge':'produit'}
                      </span>
                    </td>
                    {Array(12).fill(0).map((_, fi) => (
                      <td key={fi} style={{ padding:'2px 2px' }}>
                        <input
                          type="number" value={bv.b?.[fi] ?? 0}
                          onChange={e => handleCell(acc, fi, e.target.value)}
                          style={{ width:66, padding:'3px 4px', textAlign:'right',
                            background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
                            borderRadius:4, color: isCharge ? '#fca5a5':'#6ee7b7',
                            fontSize:11, fontFamily:'monospace', outline:'none' }}
                        />
                      </td>
                    ))}
                    <td style={{ padding:'3px 10px', textAlign:'right', fontFamily:'monospace', color:'#8b5cf6', fontWeight:600 }}>
                      {fmt(total)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {[
                { label:'📥 Total produits', row:totals.produits, color:'#10b981' },
                { label:'📤 Total charges',  row:totals.charges,  color:'#ef4444' },
                { label:'💰 Résultat',       row:totals.result,   color:'#3b82f6' },
              ].map(({ label, row, color }) => (
                <tr key={label} style={{ background:'rgba(255,255,255,0.025)', borderTop:'2px solid rgba(255,255,255,0.08)' }}>
                  <td style={{ padding:'7px 12px', fontWeight:700, color, fontSize:12 }}>{label}</td>
                  <td />
                  {row.map((v, i) => (
                    <td key={i} style={{ padding:'7px 4px', textAlign:'right', fontFamily:'monospace', fontWeight:600,
                      color: v<0 ? '#ef4444' : color }}>{fmt(v)}</td>
                  ))}
                  <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700,
                    color: row.reduce((s,x)=>s+x,0)<0 ? '#ef4444':color }}>
                    {fmt(row.reduce((s,x)=>s+x,0))}
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
