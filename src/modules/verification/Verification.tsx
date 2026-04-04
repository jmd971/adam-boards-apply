import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, monthLabel } from '@/lib/calc'

export function Verification() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const stats = useMemo(() => {
    if (!RAW) return null
    let totalEcritures = 0
    let totalComptes   = 0

    const checks = selCo.map(co => {
      const pn  = RAW.companies[co]?.pn  ?? {}
      const p1  = RAW.companies[co]?.p1  ?? {}
      let dN = 0, cN = 0, dN1 = 0, cN1 = 0
      let nbComptes = 0, nbEcritures = 0

      for (const [, data] of Object.entries(pn)) {
        const mo = (data as any)?.mo ?? {}
        nbComptes++
        for (const vals of Object.values(mo)) {
          const v = vals as [number, number]
          if (!Array.isArray(v) || v.length < 2) continue
          dN += v[0]; cN += v[1]
        }
        const e = (data as any)?.e
        if (Array.isArray(e)) nbEcritures += e.length
      }

      for (const [, data] of Object.entries(p1)) {
        const mo = (data as any)?.mo ?? {}
        for (const vals of Object.values(mo)) {
          const v = vals as [number, number]
          if (!Array.isArray(v) || v.length < 2) continue
          dN1 += v[0]; cN1 += v[1]
        }
        const e = (data as any)?.e
        if (Array.isArray(e)) nbEcritures += e.length
      }

      totalEcritures += nbEcritures
      totalComptes   += nbComptes

      const diffN  = Math.round((dN  - cN)  * 100) / 100
      const diffN1 = Math.round((dN1 - cN1) * 100) / 100

      return {
        co,
        name:        RAW.companies[co]?.name || co,
        dN:          Math.round(dN),  cN:  Math.round(cN),  diffN,  okN:  Math.abs(diffN)  < 1,
        dN1:         Math.round(dN1), cN1: Math.round(cN1), diffN1, okN1: Math.abs(diffN1) < 1,
        nbComptes, nbEcritures,
        msN:  RAW.mn.length,
        msN1: RAW.m1.length,
      }
    })

    return { checks, totalEcritures, totalComptes }
  }, [RAW, selCo.join(',')])

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée.</div>
  )

  if (!stats) return null

  const { checks, totalEcritures, totalComptes } = stats

  return (
    <div style={{ padding: '20px 24px', maxWidth: 800 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 20 }}>
        Contrôle de cohérence des données
      </div>

      {/* Compteurs globaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Sociétés',    value: RAW.keys.length,                      color: '#3b82f6' },
          { label: 'Mois N',      value: RAW.mn.length,                         color: '#10b981' },
          { label: 'Mois N-1',    value: RAW.m1.length,                         color: '#14b8a6' },
          { label: 'Comptes',     value: totalComptes,                           color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#0f172a', borderRadius: 10, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'monospace' }}>{value.toLocaleString('fr-FR')}</div>
          </div>
        ))}
      </div>

      {/* Écritures */}
      <div style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', marginBottom: 24, fontSize: 12, color: '#a78bfa' }}>
        📝 Total écritures chargées : <strong>{totalEcritures.toLocaleString('fr-FR')}</strong>
      </div>

      {/* Contrôle par société */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>
        Contrôle débit / crédit par société
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {checks.map(c => (
          <div key={c.co} style={{ borderRadius: 12, background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>

            {/* En-tête société */}
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 20 }}>{(c.okN && c.okN1) ? '✅' : '⚠️'}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{c.name.replace(/_/g,' ')}</span>
              <span style={{ fontSize: 10, color: '#475569' }}>{c.nbComptes} comptes · {c.nbEcritures.toLocaleString('fr-FR')} écritures</span>
            </div>

            {/* Détail N et N-1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

              {/* N */}
              <div style={{ padding: '12px 16px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 8, textTransform: 'uppercase' }}>
                  Exercice N · {c.msN} mois
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Total débit</span>
                    <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{fmt(c.dN)} €</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Total crédit</span>
                    <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{fmt(c.cN)} €</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', fontWeight: 700 }}>
                    <span style={{ color: c.okN ? '#10b981' : '#ef4444' }}>{c.okN ? '✓ Équilibré' : '⚠ Écart'}</span>
                    <span style={{ fontFamily: 'monospace', color: c.okN ? '#10b981' : '#ef4444' }}>
                      {c.okN ? '0 €' : `${fmt(Math.abs(c.diffN))} €`}
                    </span>
                  </div>
                </div>
              </div>

              {/* N-1 */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#14b8a6', marginBottom: 8, textTransform: 'uppercase' }}>
                  Exercice N-1 · {c.msN1} mois
                </div>
                {c.msN1 === 0 ? (
                  <div style={{ fontSize: 11, color: '#334155' }}>Pas de données N-1 importées</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#475569' }}>Total débit</span>
                      <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{fmt(c.dN1)} €</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#475569' }}>Total crédit</span>
                      <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{fmt(c.cN1)} €</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', fontWeight: 700 }}>
                      <span style={{ color: c.okN1 ? '#10b981' : '#ef4444' }}>{c.okN1 ? '✓ Équilibré' : '⚠ Écart'}</span>
                      <span style={{ fontFamily: 'monospace', color: c.okN1 ? '#10b981' : '#ef4444' }}>
                        {c.okN1 ? '0 €' : `${fmt(Math.abs(c.diffN1))} €`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mois disponibles */}
      {RAW.mn.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Mois disponibles</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {RAW.mn.map((m: string) => (
              <span key={m} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                {monthLabel(m)}
              </span>
            ))}
          </div>
          {RAW.m1.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {RAW.m1.map((m: string) => (
                <span key={m} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, background: 'rgba(20,184,166,0.1)', color: '#2dd4bf', border: '1px solid rgba(20,184,166,0.2)' }}>
                  {monthLabel(m)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
