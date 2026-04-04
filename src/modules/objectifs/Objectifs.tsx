import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, pct, monthIdx } from '@/lib/calc'

// Groupes de comptes pour chaque KPI
const ACCS = {
  ca:         ['706','7061','70611','707','7072','708','7080'],
  achats:     ['607','6071','6087','601','6031','604'],
  autresExt:  ['61','62','63'],
  personnel:  ['641','642','645','646'],
  amort:      ['681','682'],
  fin:        ['66'],
  is:         ['695','696','697'],
  excep:      ['77','67'],
}

function sumAccs(
  RAW: any, selCo: string[], field: 'pn' | 'p1',
  months: string[], accPrefixes: string[], isCharge = false
): number {
  let total = 0
  for (const co of selCo) {
    const data = RAW?.companies?.[co]?.[field] ?? {}
    for (const [acc, acctData] of Object.entries(data)) {
      if (!accPrefixes.some((p: string) => acc.startsWith(p))) continue
      const moMap = (acctData as any)?.mo ?? {}
      for (const m of months) {
        const mo = moMap[m]
        if (!mo || !Array.isArray(mo)) continue
        const [d, cr] = mo as [number, number]
        total += isCharge ? Math.max(0, d - cr) : Math.max(0, cr - d)
      }
    }
  }
  return Math.round(total)
}

export function Objectifs() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)

  // Sélection des mois N et N-1
  const msN = useMemo(() => {
    if (!RAW?.mn?.length) return []
    if (!filters.startM || !filters.endM) return RAW.mn
    return RAW.mn.filter((m: string) => monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM))
  }, [RAW?.mn?.join(','), filters.startM, filters.endM])

  const msN1 = useMemo(() => {
    return msN.map((m: string) => `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`).filter((m: string) => (RAW?.m1 ?? []).includes(m))
  }, [msN, RAW?.m1?.join(',')])

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // Calcul des valeurs N, N-1 et budget
  const kpiData = useMemo(() => {
    if (!RAW || !msN.length) return null

    const sum = (prefixes: string[], isCharge = false) => ({
      n:  sumAccs(RAW, selCo, 'pn', msN,  prefixes, isCharge),
      n1: sumAccs(RAW, selCo, 'p1', msN1, prefixes, isCharge),
    })

    const ca       = sum(ACCS.ca)
    const achats   = sum(ACCS.achats, true)
    const autExt   = sum(ACCS.autresExt, true)
    const pers     = sum(ACCS.personnel, true)
    const amort    = sum(ACCS.amort, true)
    const fin      = sum(ACCS.fin, true)
    const is       = sum(ACCS.is, true)
    const excep    = { n: 0, n1: 0 }

    const marge  = { n: ca.n - achats.n,  n1: ca.n1 - achats.n1 }
    const va     = { n: marge.n - autExt.n,  n1: marge.n1 - autExt.n1 }
    const ebe    = { n: va.n - pers.n,       n1: va.n1 - pers.n1 }
    const re     = { n: ebe.n - amort.n,     n1: ebe.n1 - amort.n1 }
    const rnet   = { n: re.n - fin.n + excep.n - is.n, n1: re.n1 - fin.n1 + excep.n1 - is.n1 }

    // Budget (somme des comptes sur 12 mois pour les sociétés sélectionnées)
    const budFor = (prefixes: string[], isCharge = false) => {
      let total = 0
      for (const co of selCo) {
        const bco = (budData as any)[co] ?? {}
        for (const [acc, bv] of Object.entries(bco)) {
          if (!prefixes.some(p => acc.startsWith(p))) continue
          const b = (bv as any)?.b ?? []
          const sign = isCharge ? 1 : -1
          total += sign * b.reduce((s: number, v: number) => s + (v || 0), 0)
        }
      }
      return Math.round(total)
    }

    const caB  = budFor(ACCS.ca)
    const achB = budFor(ACCS.achats, true)
    const aeB  = budFor(ACCS.autresExt, true)
    const pB   = budFor(ACCS.personnel, true)
    const aB   = budFor(ACCS.amort, true)

    return {
      ca:    { ...ca,   bud: caB },
      marge: { ...marge,bud: caB - achB },
      va:    { ...va,   bud: caB - achB - aeB },
      ebe:   { ...ebe,  bud: caB - achB - aeB - pB },
      re:    { ...re,   bud: caB - achB - aeB - pB - aB },
      rnet:  { ...rnet, bud: 0 },
    }
  }, [RAW, selCo.join(','), msN.join(','), msN1.join(','), budData])

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucune donnée. Importez un fichier FEC.
    </div>
  )

  if (!kpiData) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucun mois disponible dans la période sélectionnée.
    </div>
  )

  const hasBudget = Object.keys(budData).some(co => Object.keys((budData as any)[co] ?? {}).length > 0)
  const nbMonths  = msN.length

  const KPIS = [
    { key: 'ca',    label: "Chiffre d'affaires", icon: '💰', color: '#10b981' },
    { key: 'marge', label: 'Marge brute',         icon: '📊', color: '#3b82f6' },
    { key: 'va',    label: 'Valeur ajoutée',      icon: '⚙️',  color: '#6366f1' },
    { key: 'ebe',   label: 'EBE',                 icon: '💹', color: '#f59e0b' },
    { key: 're',    label: "Résultat exploit.",   icon: '🎯', color: '#8b5cf6' },
    { key: 'rnet',  label: 'Résultat net',        icon: '📈', color: '#14b8a6' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Période */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#475569' }}>
        <span>Période analysée :</span>
        <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
          {msN[0] || '—'} → {msN[msN.length-1] || '—'}
        </span>
        <span>({nbMonths} mois · {selCo.length} société{selCo.length > 1 ? 's' : ''})</span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16, marginBottom: 24 }}>
        {KPIS.map(kpi => {
          const d = kpiData[kpi.key as keyof typeof kpiData]
          if (!d) return null

          const real    = d.n
          const n1      = d.n1
          const bud     = d.bud
          const vsN1    = n1  !== 0 ? (real - n1)  / Math.abs(n1)  : null
          const vsBud   = bud !== 0 ? (real - bud) / Math.abs(bud) : null
          const pctObj  = bud !== 0 ? Math.min(120, Math.max(0, Math.round((real / bud) * 100))) : null
          const caReal  = kpiData.ca.n
          const pctCA   = kpi.key !== 'ca' && caReal !== 0 ? Math.round((real / caReal) * 100) : null

          return (
            <div key={kpi.key} style={{ background: '#0f172a', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.07)' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{kpi.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{kpi.label}</span>
                </div>
                {pctCA !== null && (
                  <span style={{ fontSize: 10, color: '#475569', background: 'rgba(255,255,255,0.04)', padding: '2px 7px', borderRadius: 6 }}>
                    {pctCA}% CA
                  </span>
                )}
              </div>

              {/* Valeur principale */}
              <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'monospace', marginBottom: 14, color: real < 0 ? '#ef4444' : kpi.color }}>
                {fmt(real)} €
              </div>

              {/* Comparaisons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* vs N-1 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#475569' }}>
                    vs N-1 <span style={{ color: '#334155', fontFamily: 'monospace' }}>({fmt(n1)} €)</span>
                  </span>
                  {vsN1 !== null ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: vsN1 >= 0 ? '#10b981' : '#ef4444' }}>
                      {vsN1 >= 0 ? '+' : ''}{pct(vsN1)}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#334155' }}>Pas de N-1</span>
                  )}
                </div>

                {/* vs Budget */}
                {hasBudget && bud !== 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#475569' }}>
                        vs Budget <span style={{ color: '#334155', fontFamily: 'monospace' }}>({fmt(bud)} €)</span>
                      </span>
                      {vsBud !== null ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: vsBud >= 0 ? '#10b981' : '#ef4444' }}>
                          {vsBud >= 0 ? '+' : ''}{pct(vsBud)}
                        </span>
                      ) : null}
                    </div>

                    {pctObj !== null && (
                      <div>
                        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3, transition: 'width 0.5s',
                            background: pctObj >= 100 ? '#10b981' : pctObj >= 75 ? '#f59e0b' : '#ef4444',
                            width: `${Math.min(100, pctObj)}%`
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: '#334155' }}>
                          <span>{pctObj}% de l'objectif</span>
                          {pctObj >= 100 && <span style={{ color: '#10b981' }}>✓ Dépassé</span>}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!hasBudget && (
        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: '#f59e0b' }}>
          💡 Définissez un budget dans l'onglet <strong>Budget</strong> pour comparer vos résultats avec vos objectifs.
        </div>
      )}
    </div>
  )
}
