import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, pct, monthLabel } from '@/lib/calc'

export function Complementaire() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const clientData = useMemo(() => {
    if (!RAW) return []
    const map: Record<string, { ca: number; entries: number }> = {}
    for (const co of filters.selCo) {
      const cd = RAW.companies[co]?.cdN ?? {}
      for (const [k, v] of Object.entries(cd)) {
        if (!map[k]) map[k] = { ca: 0, entries: 0 }
        map[k].ca += (v as any).ca ?? 0
        map[k].entries += (v as any).entries ?? 0
      }
    }
    return Object.entries(map)
      .filter(([, v]) => v.ca > 100)
      .sort((a, b) => b[1].ca - a[1].ca)
      .slice(0, 20)
  }, [RAW, filters.selCo.join(',')])

  const totalCA = clientData.reduce((s, [, v]) => s + v.ca, 0)

  const monthly = useMemo(() => {
    if (!RAW) return []
    return RAW.mn.map(m => {
      let ca = 0
      for (const co of filters.selCo) {
        const pn = RAW.companies[co]?.pn ?? {}
        for (const [acc, data] of Object.entries(pn)) {
          if (acc.startsWith('706') || acc.startsWith('707') || acc.startsWith('708')) {
            const mo = data.mo[m]
            if (mo) ca += mo[1] - mo[0]
          }
        }
      }
      return { month: m, ca: Math.round(ca) }
    })
  }, [RAW, filters.selCo.join(',')])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  const maxCA = Math.max(...monthly.map(m => m.ca), 1)

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Saisonnalité CA */}
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>Saisonnalité CA</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
            {monthly.map(({ month, ca }) => (
              <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', background: 'rgba(59,130,246,0.7)', borderRadius: '3px 3px 0 0', height: `${Math.round((ca / maxCA) * 100)}%`, minHeight: ca > 0 ? 2 : 0 }} />
                <span style={{ fontSize: 8, color: '#334155' }}>{month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top clients */}
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>Top clients</div>
          {clientData.length === 0 ? (
            <div style={{ fontSize: 11, color: '#334155' }}>Aucun compte client (411) détecté dans le FEC.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clientData.slice(0,8).map(([name, v]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{name}</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981' }}>{fmt(v.ca)} €</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: '#10b981', width: `${totalCA > 0 ? (v.ca / totalCA) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#334155', minWidth: 32 }}>{totalCA > 0 ? pct(v.ca/totalCA) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
