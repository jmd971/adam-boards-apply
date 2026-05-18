import { useMemo, useState, useEffect } from 'react'
import { ObjectifsChart } from '@/components/ui'
import { useAppStore } from '@/store'
import { fmt, pct } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { useCompanyObjectives, useCompanyObjectiveMutations } from '@/hooks/useCompanyObjectives'

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
  const budData = useAppStore(s => s.budData)

  const { RAW, selCo, selectedMs: msN, allMsN1Same: msN1 } = usePeriodFilter()

  const { data: objData } = useCompanyObjectives()
  const { upsert } = useCompanyObjectiveMutations()
  const objByCompany = objData?.byCompany ?? {}

  // Édition inline : { [company_key]: { rate: string, amount: string } }
  const [edits, setEdits] = useState<Record<string, { rate: string; amount: string }>>({})
  const [savingCo, setSavingCo] = useState<string | null>(null)
  const [objOpen,  setObjOpen]  = useState(true)

  // Initialise les champs édités quand objData arrive (ou change)
  useEffect(() => {
    const init: Record<string, { rate: string; amount: string }> = {}
    for (const co of selCo) {
      const o = objByCompany[co]
      init[co] = {
        rate:   o?.target_margin_rate   != null ? String(o.target_margin_rate)   : '',
        amount: o?.target_margin_amount != null ? String(o.target_margin_amount) : '',
      }
    }
    setEdits(init)
  }, [selCo.join(','), objData])

  const saveObjective = async (co: string) => {
    const e = edits[co]; if (!e) return
    setSavingCo(co)
    try {
      const rateNum   = e.rate.trim()   === '' ? null : parseFloat(e.rate.replace(',', '.'))
      const amountNum = e.amount.trim() === '' ? null : parseFloat(e.amount.replace(',', '.'))
      await upsert(co, { target_margin_rate: rateNum, target_margin_amount: amountNum })
    } catch (err) {
      console.error('[objectifs] upsert error:', err)
    } finally {
      setSavingCo(null)
    }
  }

  // Marge brute réelle par société (sur la période sélectionnée)
  const perCompanyMarge = useMemo(() => {
    if (!RAW || !msN.length) return {}
    const r: Record<string, { ca: number; achats: number; marge: number; rate: number }> = {}
    for (const co of selCo) {
      const ca     = sumAccs(RAW, [co], 'pn', msN, ACCS.ca)
      const achats = sumAccs(RAW, [co], 'pn', msN, ACCS.achats, true)
      const marge  = ca - achats
      const rate   = ca > 0 ? (marge / ca) * 100 : 0
      r[co] = { ca, achats, marge, rate }
    }
    return r
  }, [RAW, selCo.join(','), msN.join(',')])

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

    // Budget filtré sur la période sélectionnée (0=Jan … 11=Déc)
    const monthIndices = msN.map(m => parseInt(m.slice(5)) - 1)
    const budFor = (prefixes: string[], isCharge = false) => {
      let total = 0
      for (const co of selCo) {
        const bco = (budData as any)[co] ?? {}
        for (const [acc, bv] of Object.entries(bco)) {
          if (!prefixes.some(p => acc.startsWith(p))) continue
          const b = (bv as any)?.b ?? []
          const sign = isCharge ? 1 : -1
          total += sign * monthIndices.reduce((s: number, idx: number) => s + (b[idx] || 0), 0)
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

      {/* 🎯 Objectifs de marge par société (éditable + suivi) */}
      <div style={{ background:'#0f172a', borderRadius:12, border:'1px solid rgba(255,255,255,0.07)', marginBottom:24, overflow:'hidden' }}>
        <div onClick={() => setObjOpen(o => !o)}
          style={{ padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none', borderBottom: objOpen ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:10, color:'#475569' }}>{objOpen ? '▾' : '▸'}</span>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.7px' }}>
              🎯 Objectifs de marge par société
            </span>
          </div>
          <span style={{ fontSize:10, color:'#475569' }}>
            Taux cible (% marge / CA) + montant cible (€ pour la période)
          </span>
        </div>

        {objOpen && (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                  <th style={{ textAlign:'left',  padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Société</th>
                  <th style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Taux cible (%)</th>
                  <th style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Marge cible (€)</th>
                  <th style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Marge réelle (€)</th>
                  <th style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Taux réel (%)</th>
                  <th style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Écart taux (pts)</th>
                  <th style={{ textAlign:'right', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>% atteint (€)</th>
                  <th style={{ textAlign:'center', padding:'10px 14px', color:'var(--text-2)', fontWeight:600, fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}></th>
                </tr>
              </thead>
              <tbody>
                {selCo.map(co => {
                  const real     = perCompanyMarge[co] ?? { ca:0, achats:0, marge:0, rate:0 }
                  const obj      = objByCompany[co]
                  const tgtRate  = obj?.target_margin_rate
                  const tgtAmt   = obj?.target_margin_amount
                  const ed       = edits[co] ?? { rate:'', amount:'' }
                  const deltaPts = tgtRate != null ? real.rate - Number(tgtRate) : null
                  const pctAmt   = tgtAmt != null && Number(tgtAmt) !== 0 ? Math.round((real.marge / Number(tgtAmt)) * 100) : null
                  const inputSt: React.CSSProperties = {
                    background:'#1e293b', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6,
                    color:'var(--text-0)', padding:'5px 8px', fontSize:11, width:90,
                    textAlign:'right', fontFamily:'monospace', outline:'none',
                  }
                  return (
                    <tr key={co} style={{ borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding:'8px 14px', color:'var(--text-0)', fontWeight:600 }}>
                        {RAW.companies[co]?.name || co}
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right' }}>
                        <input type="number" step="0.1" min="0" max="100" placeholder="—"
                          value={ed.rate}
                          onChange={e => setEdits(p => ({ ...p, [co]: { ...ed, rate: e.target.value } }))}
                          style={inputSt} />
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right' }}>
                        <input type="number" step="100" placeholder="—"
                          value={ed.amount}
                          onChange={e => setEdits(p => ({ ...p, [co]: { ...ed, amount: e.target.value } }))}
                          style={{ ...inputSt, width:110 }} />
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', color: real.marge < 0 ? '#ef4444' : 'var(--text-1)' }}>
                        {fmt(real.marge)} €
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', color: real.rate < 0 ? '#ef4444' : 'var(--text-1)' }}>
                        {real.ca > 0 ? `${real.rate.toFixed(1)} %` : '—'}
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700,
                        color: deltaPts == null ? '#475569' : deltaPts >= 0 ? '#10b981' : '#ef4444' }}>
                        {deltaPts != null ? `${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts` : '—'}
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700,
                        color: pctAmt == null ? '#475569' : pctAmt >= 100 ? '#10b981' : pctAmt >= 75 ? '#f59e0b' : '#ef4444' }}>
                        {pctAmt != null ? `${pctAmt} %` : '—'}
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'center' }}>
                        <button onClick={() => saveObjective(co)} disabled={savingCo === co}
                          style={{
                            padding:'5px 12px', borderRadius:6, fontSize:11, fontWeight:600,
                            background: savingCo === co ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.18)',
                            color: savingCo === co ? '#64748b' : '#93c5fd',
                            border:'1px solid rgba(59,130,246,0.3)', cursor: savingCo === co ? 'wait' : 'pointer',
                          }}>
                          {savingCo === co ? '…' : 'Enregistrer'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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

      {hasBudget && (
        <div style={{ background:'var(--bg-1,#0f172a)', borderRadius:12, padding:'20px 20px 16px', border:'1px solid rgba(255,255,255,0.07)', marginTop:8 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:12 }}>
            🎯 Réalisation des objectifs
          </div>
          <ObjectifsChart
            hasBudget={hasBudget}
            height={300}
            kpis={KPIS.map(k => ({
              label: k.label,
              icon:  k.icon,
              color: k.color,
              real:  kpiData[k.key as keyof typeof kpiData]?.n  ?? 0,
              bud:   kpiData[k.key as keyof typeof kpiData]?.bud ?? 0,
            }))}
          />
        </div>
      )}
      {!hasBudget && (
        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: '#f59e0b' }}>
          💡 Définissez un budget dans l'onglet <strong>Budget</strong> pour comparer vos résultats avec vos objectifs.
        </div>
      )}
    </div>
  )
}
