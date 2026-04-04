import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, monthLabel } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

export function Tresorerie() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)

  const months = useMemo(() => RAW?.mn ?? [], [RAW?.mn?.join(',')])

  const cashFlow = useMemo(() => {
    if (!RAW || !months.length) return []
    return months.map(m => {
      let encaiss = 0, decaiss = 0
      for (const co of filters.selCo) {
        const pn = RAW.companies[co]?.pn ?? {}
        for (const [acc, data] of Object.entries(pn)) {
          const mo = data.mo[m]
          if (!mo) continue
          const solde = mo[1] - mo[0]
          if (acc.startsWith('706') || acc.startsWith('707') || acc.startsWith('708')) encaiss += Math.max(0, solde)
          if (acc.startsWith('6'))  decaiss += Math.max(0, mo[0] - mo[1])
        }
      }
      for (const me of manualEntries) {
        if (!me.entry_date?.startsWith(m)) continue
        const ht = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
        if (me.category === 'Vente') encaiss += ht
        else decaiss += ht
      }
      return { month: m, encaiss: Math.round(encaiss), decaiss: Math.round(decaiss), flux: Math.round(encaiss - decaiss) }
    })
  }, [RAW, filters.selCo.join(','), months.join(','), manualEntries])

  const totalEncaiss = cashFlow.reduce((s, r) => s + r.encaiss, 0)
  const totalDecaiss = cashFlow.reduce((s, r) => s + r.decaiss, 0)
  const totalFlux    = totalEncaiss - totalDecaiss

  let cumul = 0
  const rows = cashFlow.map(r => { cumul += r.flux; return { ...r, cumul } })

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Encaissements N"  value={`${fmt(totalEncaiss)} €`} color="#10b981" />
        <KpiCard label="Décaissements N"  value={`${fmt(totalDecaiss)} €`} color="#ef4444" />
        <KpiCard label="Flux net"          value={`${fmt(totalFlux)} €`}   color={totalFlux >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#0f172a', position: 'sticky', top: 0, zIndex: 5 }}>
              {['Poste', ...MONTHS_SHORT, 'Total'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Poste' ? 'left' : 'right', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: h === 'Poste' ? 160 : 70 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: '📥 Encaissements', key: 'encaiss' as const, color: '#10b981' },
              { label: '📤 Décaissements', key: 'decaiss' as const, color: '#ef4444' },
              { label: '💰 Flux net',       key: 'flux' as const,    color: '#3b82f6' },
              { label: '📊 Cumul',          key: 'cumul' as const,   color: '#8b5cf6' },
            ].map(row => {
              const vals = rows.map(r => r[row.key])
              const total = row.key === 'cumul' ? (rows[rows.length-1]?.cumul ?? 0) : vals.reduce((s,v) => s+v, 0)
              return (
                <tr key={row.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: row.key === 'cumul' ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '6px 10px', color: row.color, fontWeight: row.key === 'flux' || row.key === 'cumul' ? 700 : 400 }}>{row.label}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', color: v < 0 ? '#ef4444' : row.color, fontWeight: row.key === 'flux' || row.key === 'cumul' ? 600 : 400 }}>
                      {v !== 0 ? fmt(v) : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: total < 0 ? '#ef4444' : row.color }}>{fmt(total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 10, color: '#334155' }}>
        * Données estimées à partir du Grand Livre FEC et des saisies manuelles. Pour une trésorerie prévisionnelle détaillée, utilisez l'onglet Saisie.
      </div>
    </div>
  )
}
