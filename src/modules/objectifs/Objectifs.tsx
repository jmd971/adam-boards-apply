import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { computePlCalc, fmt, pct, monthIdx } from '@/lib/calc'
import { SIG } from '@/lib/structure'

export function Objectifs() {
  const RAW = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)

  const selectedMs = useMemo(() => {
    const all = [...new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])].sort()
    if (!filters.startM || !filters.endM) return RAW?.mn ?? []
    return all.filter(m => monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM))
  }, [RAW?.mn?.join(','), RAW?.m1?.join(','), filters.startM, filters.endM])

  const msSrc = useMemo(() => selectedMs.map(m => (RAW?.mn ?? []).includes(m) ? 'pn' as const : 'p1' as const), [selectedMs, RAW?.mn?.join(',')])
  const allMsN1Same = useMemo(() => selectedMs.map(m => `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`).filter(m => (RAW?.m1 ?? []).includes(m)), [selectedMs, RAW?.m1?.join(',')])

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1Same.map(() => 'p1' as const), budData as any, SIG, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  const kpis = [
    { id: 'ca',   label: "Chiffre d'affaires", icon: '💰', color: '#10b981' },
    { id: 'va',   label: 'Valeur ajoutée',     icon: '⚙️',  color: '#3b82f6' },
    { id: 'ebe',  label: 'EBE',                icon: '📊', color: '#f59e0b' },
    { id: 're',   label: 'Résultat exploit.',  icon: '🎯', color: '#8b5cf6' },
    { id: 'rnet', label: 'Résultat net',       icon: '📈', color: '#14b8a6' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {kpis.map(kpi => {
          const d = plCalc[kpi.id]
          if (!d) return null
          const real = d.cumulN, bud = d.budTotal, n1 = d.cumulN1S
          const vsN1 = n1 !== 0 ? (real - n1) / Math.abs(n1) : null
          const vsBud = bud !== 0 ? (real - bud) / Math.abs(bud) : null
          return (
            <div key={kpi.id} style={{ background: '#0f172a', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 20 }}>{kpi.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: kpi.color, fontFamily: 'monospace', marginBottom: 12 }}>{fmt(real)} €</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {n1 !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#475569' }}>vs N-1 ({fmt(n1)} €)</span>
                    <span style={{ color: vsN1 != null && vsN1 > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {vsN1 != null ? (vsN1 > 0 ? '+' : '') + pct(vsN1) : '—'}
                    </span>
                  </div>
                )}
                {bud !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#475569' }}>vs Budget ({fmt(bud)} €)</span>
                    <span style={{ color: vsBud != null && vsBud > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {vsBud != null ? (vsBud > 0 ? '+' : '') + pct(vsBud) : '—'}
                    </span>
                  </div>
                )}
                {bud !== 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: kpi.color, width: `${Math.min(100, Math.abs(bud) > 0 ? (real / bud) * 100 : 0)}%`, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#334155', marginTop: 3 }}>
                      {bud > 0 ? `${Math.round((real / bud) * 100)}% de l'objectif` : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {Object.keys(budData).length === 0 && (
        <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: '#f59e0b' }}>
          💡 Définissez un budget dans l'onglet Budget pour comparer vos résultats avec vos objectifs.
        </div>
      )}
    </div>
  )
}
