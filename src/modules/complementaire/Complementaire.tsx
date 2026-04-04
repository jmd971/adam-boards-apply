import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, pct, monthLabel } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

export function Complementaire() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // ── CA mensuel N vs N-1 ───────────────────────────────────────────────────
  const monthly = useMemo(() => {
    if (!RAW) return []
    return RAW.mn.map((m: string) => {
      let caN = 0, caN1 = 0
      const mN1 = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
      for (const co of selCo) {
        const pn = RAW.companies[co]?.pn ?? {}
        const p1 = RAW.companies[co]?.p1 ?? {}
        for (const [acc, data] of Object.entries(pn)) {
          if (!['706','707','708'].some(p => acc.startsWith(p))) continue
          const mo = (data as any)?.mo?.[m]
          if (Array.isArray(mo)) caN += Math.max(0, mo[1] - mo[0])
        }
        for (const [acc, data] of Object.entries(p1)) {
          if (!['706','707','708'].some(p => acc.startsWith(p))) continue
          const mo = (data as any)?.mo?.[mN1]
          if (Array.isArray(mo)) caN1 += Math.max(0, mo[1] - mo[0])
        }
      }
      return { month: m, caN: Math.round(caN), caN1: Math.round(caN1) }
    })
  }, [RAW, selCo.join(',')])

  // ── Top comptes par volume (tous) ─────────────────────────────────────────
  const topComptes = useMemo(() => {
    if (!RAW) return []
    const map: Record<string, { label: string; total: number; type: string }> = {}
    for (const co of selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      for (const [acc, data] of Object.entries(pn)) {
        const moMap = (data as any)?.mo ?? {}
        let t = 0
        for (const vals of Object.values(moMap)) {
          const v = vals as [number, number]
          if (!Array.isArray(v)) continue
          t += acc.startsWith('6') ? Math.max(0, v[0] - v[1]) : Math.max(0, v[1] - v[0])
        }
        if (t > 0) {
          if (!map[acc]) map[acc] = { label: (data as any)?.l || acc, total: 0, type: acc.startsWith('6') ? 'charge' : 'produit' }
          map[acc].total += Math.round(t)
        }
      }
    }
    return Object.entries(map)
      .sort(([,a],[,b]) => b.total - a.total)
      .slice(0, 15)
  }, [RAW, selCo.join(',')])

  // ── Top clients depuis cdN OU comptes 411 directs ─────────────────────────
  const topClients = useMemo(() => {
    if (!RAW) return []
    const map: Record<string, { ca: number; name: string }> = {}

    // Depuis cdN (enrichi à l'import)
    for (const co of selCo) {
      const cd = RAW.companies[co]?.cdN ?? {}
      for (const [k, v] of Object.entries(cd)) {
        if (!map[k]) map[k] = { name: (v as any)?.n || k, ca: 0 }
        map[k].ca += (v as any)?.ca ?? 0
      }
    }

    // Fallback : comptes 411 depuis pn directement
    if (Object.keys(map).length === 0) {
      for (const co of selCo) {
        const pn = RAW.companies[co]?.pn ?? {}
        for (const [acc, data] of Object.entries(pn)) {
          if (!acc.startsWith('411')) continue
          const moMap = (data as any)?.mo ?? {}
          let total = 0
          for (const vals of Object.values(moMap)) {
            const v = vals as [number, number]
            if (Array.isArray(v)) total += Math.max(0, v[1] - v[0])
          }
          if (total > 0) {
            const lbl = (data as any)?.l || acc
            if (!map[acc]) map[acc] = { name: lbl, ca: 0 }
            map[acc].ca += Math.round(total)
          }
        }
      }
    }

    return Object.entries(map)
      .filter(([,v]) => v.ca > 0)
      .sort(([,a],[,b]) => b.ca - a.ca)
      .slice(0, 12)
  }, [RAW, selCo.join(',')])

  // ── Répartition charges ───────────────────────────────────────────────────
  const chargeBreakdown = useMemo(() => {
    if (!RAW) return []
    const cats: { label: string; prefixes: string[]; color: string }[] = [
      { label: 'Achats',          prefixes: ['60','601','607'], color: '#ef4444' },
      { label: 'Sous-traitance',  prefixes: ['604'],            color: '#f97316' },
      { label: 'Services ext.',   prefixes: ['61','62'],        color: '#f59e0b' },
      { label: 'Personnel',       prefixes: ['641','642','645','646'], color: '#8b5cf6' },
      { label: 'Impôts & taxes',  prefixes: ['63'],             color: '#6366f1' },
      { label: 'Amortissements',  prefixes: ['681'],            color: '#3b82f6' },
      { label: 'Autres charges',  prefixes: ['65','66','67','68'], color: '#14b8a6' },
    ]
    return cats.map(cat => {
      let total = 0
      for (const co of selCo) {
        const pn = RAW.companies[co]?.pn ?? {}
        for (const [acc, data] of Object.entries(pn)) {
          if (!cat.prefixes.some(p => acc.startsWith(p))) continue
          const moMap = (data as any)?.mo ?? {}
          for (const vals of Object.values(moMap)) {
            const v = vals as [number, number]
            if (Array.isArray(v)) total += Math.max(0, v[0] - v[1])
          }
        }
      }
      return { ...cat, total: Math.round(total) }
    }).filter(c => c.total > 0).sort((a,b) => b.total - a.total)
  }, [RAW, selCo.join(',')])

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>
  )

  const maxCA    = Math.max(...monthly.map(m => Math.max(m.caN, m.caN1)), 1)
  const totalCA  = monthly.reduce((s, m) => s + m.caN, 0)
  const totalCH  = chargeBreakdown.reduce((s, c) => s + c.total, 0)
  const totalCli = topClients.reduce((s,[,v]) => s + v.ca, 0)
  const hasN1    = monthly.some(m => m.caN1 > 0)

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* KPIs synthèse */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        <KpiCard label="CA Total N"      value={`${fmt(totalCA)} €`}    color="#10b981" />
        <KpiCard label="Total charges"   value={`${fmt(totalCH)} €`}    color="#ef4444"
          sub={totalCA > 0 ? `${Math.round(totalCH/totalCA*100)}% du CA` : ''} />
        <KpiCard label="Résultat estimé" value={`${fmt(totalCA - totalCH)} €`}
          color={(totalCA - totalCH) >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>

        {/* Saisonnalité CA N vs N-1 */}
        <div style={{ background:'#0f172a', borderRadius:12, padding:16, border:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:4 }}>
            Saisonnalité CA
          </div>
          {hasN1 && (
            <div style={{ display:'flex', gap:12, marginBottom:10, fontSize:10 }}>
              <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'rgba(59,130,246,0.8)', display:'inline-block' }}/>N</span>
              <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'rgba(255,255,255,0.2)', display:'inline-block' }}/>N-1</span>
            </div>
          )}
          <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:100 }}>
            {monthly.map(({ month, caN, caN1 }) => (
              <div key={month} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <div style={{ width:'100%', display:'flex', gap:1, alignItems:'flex-end', height:90 }}>
                  {hasN1 && (
                    <div style={{ flex:1, background:'rgba(255,255,255,0.15)', borderRadius:'2px 2px 0 0',
                      height:`${Math.round((caN1/maxCA)*90)}px`, minHeight: caN1>0?1:0 }} />
                  )}
                  <div style={{ flex:1, background:'rgba(59,130,246,0.8)', borderRadius:'2px 2px 0 0',
                    height:`${Math.round((caN/maxCA)*90)}px`, minHeight: caN>0?1:0 }} />
                </div>
                <span style={{ fontSize:8, color:'#334155' }}>{MONTHS_SHORT[parseInt(month.slice(5))-1]}</span>
              </div>
            ))}
          </div>
          {monthly.length === 0 && (
            <div style={{ fontSize:11, color:'#334155', textAlign:'center', paddingTop:20 }}>Aucune donnée mensuelle</div>
          )}
        </div>

        {/* Top clients */}
        <div style={{ background:'#0f172a', borderRadius:12, padding:16, border:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>
            Top clients / comptes 411
          </div>
          {topClients.length === 0 ? (
            <div style={{ fontSize:11, color:'#334155' }}>
              Aucun compte 411 détecté dans le FEC.<br/>
              <span style={{ fontSize:10 }}>Les créances clients sont enregistrées dans les comptes 411xxx.</span>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {topClients.map(([k, v]) => (
                <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                      <span style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{v.name}</span>
                      <span style={{ fontSize:11, fontFamily:'monospace', color:'#10b981', flexShrink:0 }}>{fmt(v.ca)} €</span>
                    </div>
                    <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.05)' }}>
                      <div style={{ height:'100%', borderRadius:2, background:'#10b981', width:`${totalCli>0?(v.ca/totalCli)*100:0}%` }} />
                    </div>
                  </div>
                  <span style={{ fontSize:10, color:'#334155', minWidth:32, flexShrink:0 }}>
                    {totalCli>0 ? pct(v.ca/totalCli) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* Répartition des charges */}
        <div style={{ background:'#0f172a', borderRadius:12, padding:16, border:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>
            Répartition des charges
          </div>
          {chargeBreakdown.length === 0 ? (
            <div style={{ fontSize:11, color:'#334155' }}>Aucune charge détectée.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {chargeBreakdown.map(cat => (
                <div key={cat.label}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3, fontSize:11 }}>
                    <span style={{ color:'#94a3b8' }}>{cat.label}</span>
                    <div style={{ display:'flex', gap:8 }}>
                      <span style={{ fontFamily:'monospace', color:cat.color }}>{fmt(cat.total)} €</span>
                      <span style={{ color:'#334155', minWidth:36 }}>{totalCH>0?pct(cat.total/totalCH):''}</span>
                    </div>
                  </div>
                  <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,0.05)' }}>
                    <div style={{ height:'100%', borderRadius:2, background:cat.color, width:`${totalCH>0?(cat.total/totalCH)*100:0}%`, opacity:0.7 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 15 comptes par volume */}
        <div style={{ background:'#0f172a', borderRadius:12, padding:16, border:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>
            Top comptes par volume
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:280, overflowY:'auto' }}>
            {topComptes.map(([acc, data]) => (
              <div key={acc} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ fontFamily:'monospace', fontSize:10, color:'#334155', minWidth:45 }}>{acc}</span>
                <span style={{ fontSize:11, color:'#64748b', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{data.label}</span>
                <span style={{ fontSize:10, padding:'1px 5px', borderRadius:8, flexShrink:0,
                  background: data.type==='charge' ? 'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)',
                  color:      data.type==='charge' ? '#ef4444':'#10b981' }}>
                  {data.type}
                </span>
                <span style={{ fontFamily:'monospace', fontSize:11, color:'#f1f5f9', minWidth:80, textAlign:'right', flexShrink:0 }}>
                  {fmt(data.total)} €
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
