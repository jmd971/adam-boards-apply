import { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt, pct, fiscalIndex } from '@/lib/calc'
import { sb } from '@/lib/supabase'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

/* ═══════════════════════════════════════════════════════════
   What-if Simulation Panel — Scénarios budgétaires
   ═══════════════════════════════════════════════════════════ */

// Catégories de comptes pour ventilation réelle
const CAT_PREFIXES: Record<string, string[]> = {
  ca:    ['70','706','7061','70611','707','708','7072','7080'],
  achat: ['60','601','602','604','607','6031','6071','6081','6087'],
  serv:  ['61','62','613','6132','616','6162','622','6221','6226','627','628','60611','60612','60613','6063','61551'],
  pers:  ['641','6411','6412','6413','6414','6415','6416','6417','6418','6419','642','645','6451','6452','6453','6456','6457','646','6475'],
  amort: ['681','68111','68112','6811','6812','6813','6815','6816','6817','6871'],
  other: ['63','65','66','67','695','696','697','698','699'],
}

function classifyAccount(acc: string): string {
  for (const [cat, prefixes] of Object.entries(CAT_PREFIXES)) {
    if (prefixes.some(p => acc === p || acc.startsWith(p))) return cat
  }
  return acc.startsWith('7') ? 'ca' : 'other'
}

interface CategoryTotals {
  monthly: number[]  // 12 months
  total: number
}

function computeCategoryTotals(coBud: Record<string, any>): Record<string, CategoryTotals> {
  const cats: Record<string, number[]> = {}
  for (const cat of Object.keys(CAT_PREFIXES)) cats[cat] = Array(12).fill(0)

  for (const [acc, v] of Object.entries(coBud)) {
    const bv = v as any
    if (!bv.b) continue
    const cat = classifyAccount(acc)
    if (!cats[cat]) cats[cat] = Array(12).fill(0)
    bv.b.forEach((val: number, i: number) => { cats[cat][i] += val })
  }

  const result: Record<string, CategoryTotals> = {}
  for (const [cat, monthly] of Object.entries(cats)) {
    result[cat] = { monthly, total: monthly.reduce((s, v) => s + v, 0) }
  }
  return result
}

interface Scenario {
  name: string
  icon: string
  desc: string
  vars: { ca: number; achat: number; serv: number; pers: number; amort: number; other: number }
}

const PRESETS: Scenario[] = [
  { name: 'Croissance', icon: '📈', desc: '+10% CA, charges stables',
    vars: { ca: 10, achat: 5, serv: 0, pers: 0, amort: 0, other: 0 } },
  { name: 'Optimiste',  icon: '🚀', desc: '+15% CA, +5% achats',
    vars: { ca: 15, achat: 5, serv: 2, pers: 3, amort: 0, other: 0 } },
  { name: 'Prudent',    icon: '🛡️', desc: 'CA stable, -5% charges',
    vars: { ca: 0, achat: -5, serv: -5, pers: 0, amort: 0, other: -5 } },
  { name: 'Pessimiste', icon: '📉', desc: '-10% CA, charges stables',
    vars: { ca: -10, achat: 0, serv: 0, pers: 0, amort: 0, other: 0 } },
  { name: 'Crise',      icon: '⚠️', desc: '-20% CA, +5% charges',
    vars: { ca: -20, achat: 5, serv: 5, pers: 0, amort: 0, other: 5 } },
  { name: 'Expansion',  icon: '🏭', desc: '+25% CA, +15% charges, +10% personnel',
    vars: { ca: 25, achat: 15, serv: 10, pers: 10, amort: 5, other: 5 } },
]

interface WhatIfProps {
  coBud: Record<string, any>
}

function WhatIfPanel({ coBud }: WhatIfProps) {
  const [caVar, setCaVar]       = useState(0)
  const [achVar, setAchVar]     = useState(0)
  const [servVar, setServVar]   = useState(0)
  const [persVar, setPersVar]   = useState(0)
  const [amortVar, setAmortVar] = useState(0)
  const [otherVar, setOtherVar] = useState(0)
  const [showMonthly, setShowMonthly] = useState(false)

  const cats = useMemo(() => computeCategoryTotals(coBud), [coBud])

  const applyPreset = (p: Scenario) => {
    setCaVar(p.vars.ca); setAchVar(p.vars.achat); setServVar(p.vars.serv)
    setPersVar(p.vars.pers); setAmortVar(p.vars.amort); setOtherVar(p.vars.other)
  }

  const reset = () => { setCaVar(0); setAchVar(0); setServVar(0); setPersVar(0); setAmortVar(0); setOtherVar(0) }
  const isDirty = caVar !== 0 || achVar !== 0 || servVar !== 0 || persVar !== 0 || amortVar !== 0 || otherVar !== 0

  // Simulated monthly values
  const simMonthly = useMemo(() => {
    return Array(12).fill(0).map((_, i) => {
      const ca    = (cats.ca?.monthly[i] ?? 0) * (1 + caVar / 100)
      const achat = (cats.achat?.monthly[i] ?? 0) * (1 + achVar / 100)
      const serv  = (cats.serv?.monthly[i] ?? 0) * (1 + servVar / 100)
      const pers  = (cats.pers?.monthly[i] ?? 0) * (1 + persVar / 100)
      const amort = (cats.amort?.monthly[i] ?? 0) * (1 + amortVar / 100)
      const other = (cats.other?.monthly[i] ?? 0) * (1 + otherVar / 100)
      const totalCharges = achat + serv + pers + amort + other
      const marge = ca - achat
      const ebe   = marge - serv - pers
      const re    = ebe - amort
      const rnet  = re - other
      return { ca, achat, serv, pers, amort, other, totalCharges, marge, ebe, re, rnet }
    })
  }, [cats, caVar, achVar, servVar, persVar, amortVar, otherVar])

  // Base monthly values (no variation)
  const baseMonthly = useMemo(() => {
    return Array(12).fill(0).map((_, i) => {
      const ca    = cats.ca?.monthly[i] ?? 0
      const achat = cats.achat?.monthly[i] ?? 0
      const serv  = cats.serv?.monthly[i] ?? 0
      const pers  = cats.pers?.monthly[i] ?? 0
      const amort = cats.amort?.monthly[i] ?? 0
      const other = cats.other?.monthly[i] ?? 0
      const totalCharges = achat + serv + pers + amort + other
      const marge = ca - achat
      const ebe   = marge - serv - pers
      const re    = ebe - amort
      const rnet  = re - other
      return { ca, achat, serv, pers, amort, other, totalCharges, marge, ebe, re, rnet }
    })
  }, [cats])

  // Totals
  const sum = (arr: { [k: string]: number }[], key: string) => arr.reduce((s, m) => s + (m[key] ?? 0), 0)
  const baseCa     = sum(baseMonthly, 'ca')
  const simCa      = sum(simMonthly, 'ca')
  const baseMarge  = sum(baseMonthly, 'marge')
  const simMarge   = sum(simMonthly, 'marge')
  const baseEbe    = sum(baseMonthly, 'ebe')
  const simEbe     = sum(simMonthly, 'ebe')
  const baseRe     = sum(baseMonthly, 're')
  const simRe      = sum(simMonthly, 're')
  const baseRnet   = sum(baseMonthly, 'rnet')
  const simRnet    = sum(simMonthly, 'rnet')
  const baseCharges = sum(baseMonthly, 'totalCharges')
  const simCharges  = sum(simMonthly, 'totalCharges')

  const sliders: { label: string; value: number; set: (v: number) => void; color: string; base: number }[] = [
    { label: 'CA / Produits',       value: caVar,    set: setCaVar,    color: '#10b981', base: cats.ca?.total ?? 0 },
    { label: 'Achats',              value: achVar,   set: setAchVar,   color: '#ef4444', base: cats.achat?.total ?? 0 },
    { label: 'Services extérieurs', value: servVar,  set: setServVar,  color: '#f97316', base: cats.serv?.total ?? 0 },
    { label: 'Personnel',           value: persVar,  set: setPersVar,  color: '#8b5cf6', base: cats.pers?.total ?? 0 },
    { label: 'Amortissements',      value: amortVar, set: setAmortVar, color: '#f59e0b', base: cats.amort?.total ?? 0 },
    { label: 'Autres charges',      value: otherVar, set: setOtherVar, color: '#64748b', base: cats.other?.total ?? 0 },
  ]

  const kpis: { label: string; base: number; sim: number; color: string; accent: string }[] = [
    { label: "Chiffre d'affaires", base: baseCa,      sim: simCa,      color: '#10b981', accent: 'rgba(16,185,129,0.1)' },
    { label: 'Marge globale',      base: baseMarge,    sim: simMarge,   color: '#8b5cf6', accent: 'rgba(139,92,246,0.1)' },
    { label: 'EBE',                base: baseEbe,      sim: simEbe,     color: '#f59e0b', accent: 'rgba(245,158,11,0.1)' },
    { label: "Résultat d'expl.",   base: baseRe,       sim: simRe,      color: '#3b82f6', accent: 'rgba(59,130,246,0.1)' },
    { label: 'Résultat net',       base: baseRnet,     sim: simRnet,    color: simRnet >= 0 ? '#10b981' : '#ef4444', accent: simRnet >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' },
    { label: 'Total charges',      base: baseCharges,  sim: simCharges, color: '#ef4444', accent: 'rgba(239,68,68,0.1)' },
  ]

  // Bar width for visual comparison
  const maxKpi = Math.max(...kpis.map(k => Math.max(Math.abs(k.base), Math.abs(k.sim))), 1)

  return (
    <div style={{
      background: '#0f172a', borderRadius: 12, padding: '20px 24px', marginBottom: 16,
      border: '1px solid rgba(139,92,246,0.25)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Simulation What-if
          </div>
          <span style={{ fontSize: 10, color: '#475569', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>
            Basé sur les données réelles du budget
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowMonthly(v => !v)} style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
            background: showMonthly ? 'rgba(59,130,246,0.15)' : 'transparent',
            border: `1px solid ${showMonthly ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: showMonthly ? '#93c5fd' : '#64748b',
          }}>
            Détail mensuel
          </button>
          {isDirty && (
            <button onClick={reset} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b',
            }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Preset scenarios */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PRESETS.map(p => {
          const isActive = caVar === p.vars.ca && achVar === p.vars.achat && servVar === p.vars.serv
            && persVar === p.vars.pers && amortVar === p.vars.amort && otherVar === p.vars.other
          return (
            <button key={p.name} onClick={() => applyPreset(p)}
              title={p.desc}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: isActive ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? '#a78bfa' : '#64748b',
                transition: 'all 0.15s',
              }}>
              {p.icon} {p.name}
            </button>
          )
        })}
      </div>

      {/* Sliders with real base amounts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10, marginBottom: 20 }}>
        {sliders.map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 10px', borderRadius: 8,
            background: s.value !== 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
          }}>
            <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 140 }}>
              {s.label}
              <span style={{ display: 'block', fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>
                Base : {fmt(s.base)} €
              </span>
            </span>
            <input type="range" min={-50} max={50} step={1} value={s.value}
              onChange={e => s.set(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: s.color, height: 4 }} />
            <span style={{
              fontSize: 12, fontFamily: 'monospace', fontWeight: 700, minWidth: 48, textAlign: 'right',
              color: s.value > 0 ? '#10b981' : s.value < 0 ? '#ef4444' : '#475569',
            }}>
              {s.value > 0 ? '+' : ''}{s.value}%
            </span>
            {s.value !== 0 && (
              <span style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace', minWidth: 70, textAlign: 'right' }}>
                {s.value > 0 ? '+' : ''}{fmt(Math.round(s.base * s.value / 100))} €
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Impact KPIs with visual bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: isDirty ? 16 : 0 }}>
        {kpis.map(k => {
          const delta = k.sim - k.base
          const deltaPct = k.base !== 0 ? delta / Math.abs(k.base) : 0
          const baseW = Math.abs(k.base) / maxKpi * 100
          const simW  = Math.abs(k.sim)  / maxKpi * 100
          return (
            <div key={k.label} style={{
              padding: '12px 14px', borderRadius: 10,
              background: k.accent, border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: k.color }}>
                  {fmt(k.sim)} €
                </span>
                {isDirty && delta !== 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                    color: delta > 0 ? '#10b981' : '#ef4444',
                  }}>
                    {delta > 0 ? '+' : ''}{fmt(delta)} €
                    <span style={{ fontSize: 9, marginLeft: 3 }}>
                      ({delta > 0 ? '+' : ''}{(deltaPct * 100).toFixed(1)}%)
                    </span>
                  </span>
                )}
              </div>
              {/* Visual comparison bars */}
              {isDirty && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#475569', minWidth: 30 }}>Base</span>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${baseW}%`, height: '100%', background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 8, color: '#334155', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>{fmt(k.base)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: k.color, minWidth: 30 }}>Sim.</span>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${simW}%`, height: '100%', background: k.color, borderRadius: 2, opacity: 0.7 }} />
                    </div>
                    <span style={{ fontSize: 8, color: '#334155', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>{fmt(k.sim)}</span>
                  </div>
                </div>
              )}
              {!isDirty && (
                <div style={{ fontSize: 10, color: '#334155' }}>
                  Budget : {fmt(k.base)} €
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Taux de marge EBE/CA */}
      {isDirty && (
        <div style={{
          display: 'flex', gap: 16, padding: '10px 14px', borderRadius: 8, marginBottom: showMonthly ? 16 : 0,
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Taux de marge EBE/CA :
            <span style={{ fontFamily: 'monospace', fontWeight: 700, marginLeft: 6, color: '#f59e0b' }}>
              {baseCa > 0 ? pct(baseEbe / baseCa) : '—'}
            </span>
            <span style={{ color: '#475569', margin: '0 6px' }}>→</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: simEbe / simCa > baseEbe / baseCa ? '#10b981' : '#ef4444' }}>
              {simCa > 0 ? pct(simEbe / simCa) : '—'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Taux résultat/CA :
            <span style={{ fontFamily: 'monospace', fontWeight: 700, marginLeft: 6, color: '#3b82f6' }}>
              {baseCa > 0 ? pct(baseRe / baseCa) : '—'}
            </span>
            <span style={{ color: '#475569', margin: '0 6px' }}>→</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: simRe / simCa > baseRe / baseCa ? '#10b981' : '#ef4444' }}>
              {simCa > 0 ? pct(simRe / simCa) : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Monthly simulation table */}
      {showMonthly && isDirty && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#080d1a' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', left: 0, background: '#080d1a', zIndex: 2 }}>Indicateur</th>
                {MONTHS_SHORT.map(m => (
                  <th key={m} style={{ padding: '6px 4px', textAlign: 'right', color: '#475569', fontWeight: 600, minWidth: 62, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{m}</th>
                ))}
                <th style={{ padding: '6px 10px', textAlign: 'right', color: '#3b82f6', fontWeight: 700, minWidth: 80, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'ca',     label: "CA simulé",     color: '#10b981' },
                { key: 'achat',  label: 'Achats simulés', color: '#ef4444' },
                { key: 'marge',  label: 'Marge',         color: '#8b5cf6' },
                { key: 'serv',   label: 'Services ext.',  color: '#f97316' },
                { key: 'pers',   label: 'Personnel',      color: '#a78bfa' },
                { key: 'ebe',    label: 'EBE',            color: '#f59e0b' },
                { key: 'amort',  label: 'Amortissements', color: '#64748b' },
                { key: 're',     label: "Résultat d'expl.", color: '#3b82f6' },
                { key: 'rnet',   label: 'Résultat net',   color: '#10b981' },
              ].map(({ key, label, color }) => {
                const rowTotal = simMonthly.reduce((s, m) => s + (m[key as keyof typeof m] ?? 0), 0)
                const baseTotal = baseMonthly.reduce((s, m) => s + (m[key as keyof typeof m] ?? 0), 0)
                const isBold = ['ebe', 're', 'rnet', 'marge'].includes(key)
                return (
                  <tr key={key} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: isBold ? 'rgba(255,255,255,0.02)' : 'transparent',
                  }}>
                    <td style={{
                      padding: '4px 10px', color, fontWeight: isBold ? 700 : 400, fontSize: isBold ? 11 : 10,
                      position: 'sticky', left: 0, background: isBold ? '#0c1120' : '#0a0f1a', zIndex: 1,
                    }}>
                      {label}
                    </td>
                    {simMonthly.map((m, i) => {
                      const val = m[key as keyof typeof m] ?? 0
                      const base = baseMonthly[i][key as keyof typeof baseMonthly[0]] ?? 0
                      const diff = val - base
                      return (
                        <td key={i} style={{ padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
                          <div style={{ color: val < 0 ? '#ef4444' : color, fontWeight: isBold ? 600 : 400 }}>
                            {fmt(val)}
                          </div>
                          {diff !== 0 && (
                            <div style={{ fontSize: 8, color: diff > 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)' }}>
                              {diff > 0 ? '+' : ''}{fmt(diff)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                    <td style={{
                      padding: '4px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color,
                    }}>
                      <div>{fmt(rowTotal)}</div>
                      {rowTotal !== baseTotal && (
                        <div style={{ fontSize: 8, color: rowTotal > baseTotal ? '#10b981' : '#ef4444' }}>
                          {rowTotal > baseTotal ? '+' : ''}{fmt(rowTotal - baseTotal)}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Budget() {
  const RAW        = useAppStore(s => s.RAW)
  const filters    = useAppStore(s => s.filters)
  const budData    = useAppStore(s => s.budData)
  const setBudData = useAppStore(s => s.setBudData)
  const tenantId   = useAppStore(s => s.tenantId)

  const [budCo,     setBudCo]     = useState(filters.selCo[0] ?? '')
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState<string | null>(null)
  const [filter,    setFilter]    = useState<'all' | 'charge' | 'produit'>('all')
  const [search,    setSearch]    = useState('')
  const [showWhatIf, setShowWhatIf] = useState(false)

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
      { tenant_id: tenantId, company_key: budCo, data: coBud, status: 'draft' },
      { onConflict: 'tenant_id,company_key' }
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
          {Object.keys(coBud).length > 0 && (
            <button onClick={() => setShowWhatIf(v => !v)}
              style={{ padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                background: showWhatIf ? 'rgba(139,92,246,0.2)' : 'transparent',
                border: `1px solid ${showWhatIf ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: showWhatIf ? '#a78bfa' : '#475569' }}>
              Scénarios What-if
            </button>
          )}
        </div>

        {msg && <span style={{ fontSize:12, color: msg.startsWith('✅') ? '#10b981':'#ef4444', width:'100%' }}>{msg}</span>}
      </div>

      {/* What-if simulation */}
      {showWhatIf && Object.keys(coBud).length > 0 && (
        <WhatIfPanel coBud={coBud} />
      )}

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
