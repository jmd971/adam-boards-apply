import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'

export function Verification() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const checks = useMemo(() => {
    if (!RAW) return []
    const results = []
    for (const co of filters.selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      let totalD = 0, totalC = 0
      for (const data of Object.values(pn)) {
        for (const [d, c] of Object.values(data.mo)) { totalD += d; totalC += c }
      }
      const diff = Math.round((totalD - totalC) * 100) / 100
      results.push({ co, totalD: Math.round(totalD), totalC: Math.round(totalC), diff, ok: Math.abs(diff) < 1 })
    }
    return results
  }, [RAW, filters.selCo.join(',')])

  const ecritures = useMemo(() => {
    if (!RAW) return 0
    let n = 0
    for (const co of filters.selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      for (const data of Object.values(pn)) n += data.e?.length ?? 0
    }
    return n
  }, [RAW, filters.selCo.join(',')])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>

  return (
    <div style={{ padding: '20px 24px', maxWidth: 700 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Contrôle de cohérence des données</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#0f172a', borderRadius: 10, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>SOCIÉTÉS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{RAW.keys.length}</div>
        </div>
        <div style={{ background: '#0f172a', borderRadius: 10, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>MOIS N</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{RAW.mn.length}</div>
        </div>
        <div style={{ background: '#0f172a', borderRadius: 10, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>ÉCRITURES</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#8b5cf6' }}>{ecritures.toLocaleString('fr-FR')}</div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>Équilibre débit / crédit</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {checks.map(c => (
          <div key={c.co} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: '#0f172a', border: `1px solid ${c.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.3)'}` }}>
            <span style={{ fontSize: 16 }}>{c.ok ? '✅' : '⚠️'}</span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{c.co.replace(/_/g,' ')}</span>
            <span style={{ fontSize: 11, color: '#475569' }}>D: {fmt(c.totalD)} €</span>
            <span style={{ fontSize: 11, color: '#475569' }}>C: {fmt(c.totalC)} €</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.ok ? '#10b981' : '#ef4444' }}>
              {c.ok ? 'Équilibré' : `Écart: ${fmt(Math.abs(c.diff))} €`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
