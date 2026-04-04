import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { computePlCalc, fmt, pct, monthIdx } from '@/lib/calc'
import { SIG } from '@/lib/structure'

export function Objectifs() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)

  const selectedMs = useMemo(() => {
    const all = [...new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])].sort()
    if (!filters.startM || !filters.endM) return RAW?.mn ?? []
    return all.filter(m => monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM))
  }, [RAW?.mn?.join(','), RAW?.m1?.join(','), filters.startM, filters.endM])

  const msSrc       = useMemo(() => selectedMs.map(m => (RAW?.mn ?? []).includes(m) ? 'pn' as const : 'p1' as const), [selectedMs, RAW?.mn?.join(',')])
  const allMsN1Same = useMemo(() => selectedMs.map(m => `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`).filter(m => (RAW?.m1 ?? []).includes(m)), [selectedMs, RAW?.m1?.join(',')])

  // Calcul de toutes les lignes qui ont des accs
  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same,
      allMsN1Same.map(() => 'p1' as const), budData as any, SIG, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  // Dériver les KPIs agrégés depuis les lignes de base (qui ont des accs)
  const kpiValues = useMemo(() => {
    const g = (id: string) => ({
      real: plCalc[id]?.cumulN ?? 0,
      n1:   plCalc[id]?.cumulN1S ?? 0,
      bud:  plCalc[id]?.budTotal ?? 0,
    })

    // Lignes de base disponibles
    const ca         = g('ca')
    const vteMdse    = g('vte_mdse')
    const coutMdse   = g('cout_mdse')
    const prodVendue = g('prod_vendue')
    const var71335   = g('71335')
    const consoProd  = g('conso_prod')
    const soustr604  = g('604')
    const autresExt  = g('autres_ext')
    const personnel  = g('personnel')
    const amort      = g('amort')
    const fin        = g('fin')
    const excep      = g('excep')
    const is         = g('is_cr') // from CR structure, fallback to is

    const derive = (
      f: (x: typeof ca) => number,
      items: (typeof ca)[]
    ) => ({
      real: f({ real: 0, n1: 0, bud: 0 }),  // placeholder replaced below
      n1:   items.reduce((s, x) => s + x.n1,  0),
      bud:  items.reduce((s, x) => s + x.bud, 0),
    })

    const margeComm = {
      real: vteMdse.real - coutMdse.real,
      n1:   vteMdse.n1   - coutMdse.n1,
      bud:  vteMdse.bud  - coutMdse.bud,
    }
    const margeProd = {
      real: prodVendue.real + var71335.real - consoProd.real - soustr604.real,
      n1:   prodVendue.n1   + var71335.n1   - consoProd.n1   - soustr604.n1,
      bud:  prodVendue.bud  + var71335.bud  - consoProd.bud  - soustr604.bud,
    }
    const marge = {
      real: margeComm.real + margeProd.real,
      n1:   margeComm.n1   + margeProd.n1,
      bud:  margeComm.bud  + margeProd.bud,
    }
    const va = {
      real: marge.real - autresExt.real,
      n1:   marge.n1   - autresExt.n1,
      bud:  marge.bud  - autresExt.bud,
    }
    const ebe = {
      real: va.real - personnel.real,
      n1:   va.n1   - personnel.n1,
      bud:  va.bud  - personnel.bud,
    }
    const re = {
      real: ebe.real - amort.real,
      n1:   ebe.n1   - amort.n1,
      bud:  ebe.bud  - amort.bud,
    }
    const rnet = {
      real: re.real - fin.real + excep.real - is.real,
      n1:   re.n1   - fin.n1   + excep.n1   - is.n1,
      bud:  re.bud  - fin.bud  + excep.bud  - is.bud,
    }

    return { ca, margeComm, margeProd, marge, va, ebe, re, rnet }
  }, [plCalc])

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>
  )

  const hasBudget = Object.keys(budData).some(co => Object.keys((budData as any)[co] ?? {}).length > 0)

  const kpis = [
    { key: 'ca',       label: "Chiffre d'affaires", icon: '💰', color: '#10b981', always: true },
    { key: 'margeComm',label: 'Marge commerciale',  icon: '🛒', color: '#f97316', always: false },
    { key: 'margeProd', label: 'Marge production',   icon: '⚙️',  color: '#14b8a6', always: false },
    { key: 'marge',    label: 'Marge globale',       icon: '📊', color: '#3b82f6', always: true },
    { key: 'va',       label: 'Valeur ajoutée',      icon: '🔧', color: '#6366f1', always: true },
    { key: 'ebe',      label: 'EBE',                 icon: '💹', color: '#f59e0b', always: true },
    { key: 're',       label: "Résultat d'exploit.", icon: '🎯', color: '#8b5cf6', always: true },
    { key: 'rnet',     label: 'Résultat net',        icon: '📈', color: '#14b8a6', always: true },
  ]

  const nbMonths = selectedMs.length || 1

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Période analysée */}
      <div style={{ marginBottom: 20, fontSize: 11, color: '#475569' }}>
        Période : <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{selectedMs[0] || '—'} → {selectedMs[selectedMs.length-1] || '—'}</span>
        {' '}({nbMonths} mois)
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {kpis.map(kpi => {
          const d = kpiValues[kpi.key as keyof typeof kpiValues]
          if (!d) return null
          const { real, n1, bud } = d

          // Masquer les lignes nulles si pas toujours affichées
          if (!kpi.always && real === 0 && n1 === 0) return null

          const vsN1  = n1  !== 0 ? (real - n1)  / Math.abs(n1)  : null
          const vsBud = bud !== 0 ? (real - bud) / Math.abs(bud) : null
          const pctObj = bud !== 0 ? Math.min(120, Math.max(0, Math.round((real / bud) * 100))) : null
          const pctCA  = kpiValues.ca.real !== 0 && kpi.key !== 'ca'
            ? Math.round((real / kpiValues.ca.real) * 100)
            : null

          return (
            <div key={kpi.key} style={{ background:'#0f172a', borderRadius:12, padding:20, border:'1px solid rgba(255,255,255,0.06)' }}>
              {/* En-tête */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:18 }}>{kpi.icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.5px' }}>{kpi.label}</span>
                </div>
                {pctCA !== null && (
                  <span style={{ fontSize:10, color:'#334155', background:'rgba(255,255,255,0.04)', padding:'2px 6px', borderRadius:6 }}>
                    {pctCA}% du CA
                  </span>
                )}
              </div>

              {/* Valeur principale */}
              <div style={{ fontSize:28, fontWeight:800, fontFamily:'monospace', marginBottom:12, color: real < 0 ? '#ef4444' : kpi.color }}>
                {fmt(real)} €
              </div>

              {/* Comparaisons */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {/* vs N-1 */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                  <span style={{ color:'#475569' }}>vs N-1</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ color:'#334155', fontFamily:'monospace', fontSize:10 }}>{fmt(n1)} €</span>
                    {vsN1 !== null ? (
                      <span style={{ fontWeight:700, color: vsN1 >= 0 ? '#10b981':'#ef4444' }}>
                        {vsN1 >= 0 ? '+' : ''}{pct(vsN1)}
                      </span>
                    ) : <span style={{ color:'#334155' }}>—</span>}
                  </div>
                </div>

                {/* vs Budget */}
                {hasBudget && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                    <span style={{ color:'#475569' }}>vs Budget</span>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ color:'#334155', fontFamily:'monospace', fontSize:10 }}>{fmt(bud)} €</span>
                      {vsBud !== null ? (
                        <span style={{ fontWeight:700, color: vsBud >= 0 ? '#10b981':'#ef4444' }}>
                          {vsBud >= 0 ? '+' : ''}{pct(vsBud)}
                        </span>
                      ) : <span style={{ color:'#334155' }}>—</span>}
                    </div>
                  </div>
                )}

                {/* Barre de progression vs budget */}
                {hasBudget && pctObj !== null && (
                  <div style={{ marginTop:4 }}>
                    <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
                      <div style={{
                        height:'100%', borderRadius:3, transition:'width 0.5s',
                        background: pctObj >= 100 ? '#10b981' : pctObj >= 80 ? '#f59e0b' : '#ef4444',
                        width: `${Math.min(100, pctObj)}%`
                      }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, fontSize:10, color:'#334155' }}>
                      <span>{pctObj}% de l'objectif</span>
                      {pctObj > 100 && <span style={{ color:'#10b981' }}>✓ Dépassé</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!hasBudget && (
        <div style={{ marginTop:24, padding:16, borderRadius:12, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', fontSize:12, color:'#f59e0b' }}>
          💡 Définissez un budget dans l'onglet <strong>Budget</strong> pour comparer vos résultats avec vos objectifs et afficher les barres de progression.
        </div>
      )}
    </div>
  )
}
