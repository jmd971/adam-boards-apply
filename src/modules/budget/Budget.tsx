import { useState, useMemo, useEffect } from 'react'
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
  startMonth?: number
}

function WhatIfPanel({ coBud, startMonth = 1 }: WhatIfProps) {
  // Ordre d'affichage des mois selon le début d'exercice fiscal
  // ex: startMonth=10 → [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8] (Oct en premier)
  const fiscalOrder = useMemo(
    () => Array(12).fill(0).map((_, d) => (startMonth - 1 + d) % 12),
    [startMonth]
  )
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
                {fiscalOrder.map(ai => (
                  <th key={ai} style={{ padding: '6px 4px', textAlign: 'right', color: '#475569', fontWeight: 600, minWidth: 62, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{MONTHS_SHORT[ai]}</th>
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
                    {fiscalOrder.map((ai) => {
                      const m = simMonthly[ai]
                      const val = m[key as keyof typeof m] ?? 0
                      const base = baseMonthly[ai][key as keyof typeof baseMonthly[0]] ?? 0
                      const diff = val - base
                      return (
                        <td key={ai} style={{ padding: '4px 4px', textAlign: 'right', fontFamily: 'monospace' }}>
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
  const RAW            = useAppStore(s => s.RAW)
  const filters        = useAppStore(s => s.filters)
  const budData        = useAppStore(s => s.budData)
  const setBudData     = useAppStore(s => s.setBudData)
  const budVersions    = useAppStore(s => s.budVersions)
  const setBudVersions = useAppStore(s => s.setBudVersions)
  const tenantId       = useAppStore(s => s.tenantId)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)

  const [budCo,        setBudCo]        = useState(filters.selCo[0] ?? '')
  const [selVersion,   setSelVersion]   = useState<string>('')
  const [compareVersion, setCompareVersion] = useState<string>('')
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState<string | null>(null)
  const [filter,       setFilter]       = useState<'all' | 'charge' | 'produit'>('all')
  const [search,       setSearch]       = useState('')
  const [showWhatIf,   setShowWhatIf]   = useState(false)
  const [newVersionName, setNewVersionName] = useState('')
  const [creating,     setCreating]     = useState(false)
  // Ajout manuel d'un compte (hors FEC)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccNum,    setNewAccNum]    = useState('')
  const [newAccLabel,  setNewAccLabel]  = useState('')
  const [newAccType,   setNewAccType]   = useState<'c' | 'p'>('c')

  // Versions for the selected company
  const coVersions = useMemo(
    () => budVersions.filter(v => v.company_key === budCo),
    [budVersions, budCo]
  )

  // Auto-select first version when company or versions change
  useMemo(() => {
    if (coVersions.length > 0 && (!selVersion || !coVersions.find(v => v.version_name === selVersion))) {
      setSelVersion(coVersions[0].version_name)
    } else if (coVersions.length === 0) {
      setSelVersion('')
    }
  }, [budCo, coVersions.map(v => v.version_name).join(',')])

  useEffect(() => {
    if (!budCo && RAW?.keys?.length) setBudCo(RAW.keys[0])
  }, [RAW?.keys?.join(',')])

  const coBud = useMemo(
    () => (budVersions.find(v => v.company_key === budCo && v.version_name === selVersion)?.data ?? {}) as Record<string, any>,
    [budVersions, budCo, selVersion]
  )

  // Exercice fiscal de la société sélectionnée
  const startMonth  = fiscalSettings[budCo] ?? 1
  // Ordre d'affichage des colonnes mois (calendaire si startMonth=1, sinon fiscal)
  const fiscalOrder = useMemo(
    () => Array(12).fill(0).map((_, d) => (startMonth - 1 + d) % 12),
    [startMonth]
  )

  // ── Comparaison de versions (#7 bis) ─────────────────────────────────────
  const compareBud = useMemo(
    () => compareVersion
      ? ((budVersions.find(v => v.company_key === budCo && v.version_name === compareVersion)?.data ?? {}) as Record<string, any>)
      : null,
    [budVersions, budCo, compareVersion]
  )

  const compareDiff = useMemo(() => {
    if (!compareBud) return null
    const cur = computeCategoryTotals(coBud)
    const cmp = computeCategoryTotals(compareBud)
    const labels: Record<string, string> = { ca:'CA', achat:'Achats', serv:'Services ext.', pers:'Personnel', amort:'Amort.', other:'Autres' }
    return ['ca', 'achat', 'serv', 'pers', 'amort', 'other'].map(cat => {
      const curT = cur[cat]?.total ?? 0
      const cmpT = cmp[cat]?.total ?? 0
      const diff = curT - cmpT
      const pctDiff = cmpT !== 0 ? diff / Math.abs(cmpT) : null
      return { cat, label: labels[cat], curT, cmpT, diff, pctDiff }
    })
  }, [coBud, compareBud])

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
        if (newBud[acc]) continue
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

    // Update store: versions + legacy budData
    const updated = budVersions.map(v =>
      v.company_key === budCo && v.version_name === selVersion ? { ...v, data: newBud } : v
    )
    setBudVersions(updated)
    setBudData({ ...budData, [co]: newBud } as any)
    setMsg('✅ Budget généré depuis N-1 — pensez à sauvegarder')
    setTimeout(() => setMsg(null), 4000)
  }

  const handleCell = (acc: string, fi: number, val: string) => {
    const num = parseFloat(val.replace(',', '.')) || 0
    const cur = coBud[acc] ?? { b: Array(12).fill(0), t: 'c', l: acc }
    const newB = [...(cur.b ?? Array(12).fill(0))]
    newB[fi] = num
    const newData = { ...coBud, [acc]: { ...cur, b: newB } }
    const updated = budVersions.map(v =>
      v.company_key === budCo && v.version_name === selVersion ? { ...v, data: newData } : v
    )
    setBudVersions(updated)
    setBudData({ ...budData, [budCo]: newData } as any)
  }

  // Ajoute un compte manuel (hors FEC) au budget courant. Le compte est créé avec
  // un tableau b[12]=0 — l'utilisateur saisit ensuite les montants mois par mois.
  const handleAddAccount = () => {
    const accNum = newAccNum.trim()
    if (!accNum) { setMsg('❌ Numéro de compte requis'); setTimeout(() => setMsg(null), 3000); return }
    if (!/^\d{3,}/.test(accNum)) { setMsg('❌ Le numéro de compte doit commencer par au moins 3 chiffres'); setTimeout(() => setMsg(null), 3000); return }
    if (coBud[accNum]) { setMsg('❌ Compte déjà existant dans cette version'); setTimeout(() => setMsg(null), 3000); return }
    const newAcc = { b: Array(12).fill(0), t: newAccType, l: newAccLabel.trim() || accNum }
    const newData = { ...coBud, [accNum]: newAcc }
    const updated = budVersions.map(v =>
      v.company_key === budCo && v.version_name === selVersion ? { ...v, data: newData } : v
    )
    setBudVersions(updated)
    setBudData({ ...budData, [budCo]: newData } as any)
    setNewAccNum('')
    setNewAccLabel('')
    setNewAccType('c')
    setShowAddAccount(false)
    setMsg('✅ Compte ajouté — pensez à saisir les montants puis sauvegarder')
    setTimeout(() => setMsg(null), 4000)
  }

  const handleSave = async () => {
    if (!selVersion) return
    setSaving(true)
    const { error } = await sb.from('budget').upsert(
      { tenant_id: tenantId, company_key: budCo, version_name: selVersion, data: coBud, status: 'draft' },
      { onConflict: 'tenant_id,company_key,version_name' }
    )
    setSaving(false)
    setMsg(error ? '❌ ' + error.message : '✅ Budget sauvegardé')
    setTimeout(() => setMsg(null), 3000)
  }

  const handleCreateVersion = async () => {
    const vn = newVersionName.trim()
    if (!vn || !budCo) return
    if (coVersions.find(v => v.version_name === vn)) {
      setMsg('❌ Une version avec ce nom existe déjà')
      setTimeout(() => setMsg(null), 3000)
      return
    }
    setCreating(true)
    const { data: insertedRows, error } = await sb.from('budget').upsert(
      { tenant_id: tenantId, company_key: budCo, version_name: vn, data: {}, status: 'draft' },
      { onConflict: 'tenant_id,company_key,version_name' }
    ).select()
    setCreating(false)
    if (error) {
      setMsg('❌ ' + error.message)
      setTimeout(() => setMsg(null), 6000)
      return
    }
    const newVersion = {
      id: (insertedRows as any)?.[0]?.id,
      company_key: budCo,
      version_name: vn,
      data: {},
      status: 'draft' as const,
    }
    setBudVersions([...budVersions, newVersion])
    setSelVersion(vn)
    setNewVersionName('')
    setMsg('✅ Version créée')
    setTimeout(() => setMsg(null), 3000)
  }

  const handleCreateAndGenerate = async () => {
    const vn = 'Budget principal'
    if (coVersions.find(v => v.version_name === vn)) {
      setSelVersion(vn)
      return
    }
    setCreating(true)
    const { data: insertedRows, error } = await sb.from('budget').upsert(
      { tenant_id: tenantId, company_key: budCo, version_name: vn, data: {}, status: 'draft' },
      { onConflict: 'tenant_id,company_key,version_name' }
    ).select()
    setCreating(false)
    if (error) {
      setMsg('❌ ' + error.message)
      setTimeout(() => setMsg(null), 6000)
      return
    }
    const newVersion = {
      id: (insertedRows as any)?.[0]?.id,
      company_key: budCo,
      version_name: vn,
      data: {},
      status: 'draft' as const,
    }
    setBudVersions([...budVersions, newVersion])
    setSelVersion(vn)
    setMsg('✅ Version créée — génération en cours...')
    setTimeout(() => setMsg(null), 4000)
  }

  const handleDuplicateVersion = async (sourceVn: string) => {
    const source = budVersions.find(
      v => v.company_key === budCo && v.version_name === sourceVn
    )
    if (!source) return

    let suggested = `${sourceVn} (copie)`
    let i = 2
    while (coVersions.find(v => v.version_name === suggested)) {
      suggested = `${sourceVn} (copie ${i++})`
    }

    const vn = prompt(
      `Nom de la nouvelle version (basée sur "${sourceVn}") :`,
      suggested
    )?.trim()
    if (!vn) return
    if (coVersions.find(v => v.version_name === vn)) {
      setMsg('❌ Une version avec ce nom existe déjà')
      setTimeout(() => setMsg(null), 3000)
      return
    }

    setCreating(true)
    const clonedData = JSON.parse(JSON.stringify(source.data ?? {}))

    const { data: insertedRows, error } = await sb.from('budget').upsert(
      { tenant_id: tenantId, company_key: budCo, version_name: vn,
        data: clonedData, status: 'draft' },
      { onConflict: 'tenant_id,company_key,version_name' }
    ).select()
    setCreating(false)

    if (error) {
      setMsg('❌ ' + error.message)
      setTimeout(() => setMsg(null), 6000)
      return
    }

    setBudVersions([...budVersions, {
      id: (insertedRows as any)?.[0]?.id,
      company_key: budCo,
      version_name: vn,
      data: clonedData,
      status: 'draft' as const,
    }])
    setSelVersion(vn)
    setMsg(`✅ Version "${vn}" créée à partir de "${sourceVn}"`)
    setTimeout(() => setMsg(null), 4000)
  }

  const handleDeleteVersion = async (vn: string) => {
    if (!confirm(`Supprimer la version "${vn}" ?`)) return
    const { error } = await sb.from('budget')
      .delete()
      .match({ tenant_id: tenantId, company_key: budCo, version_name: vn })
    if (error) {
      setMsg('❌ ' + error.message)
      setTimeout(() => setMsg(null), 3000)
      return
    }
    const updated = budVersions.filter(v => !(v.company_key === budCo && v.version_name === vn))
    setBudVersions(updated)
    if (selVersion === vn) {
      const remaining = updated.filter(v => v.company_key === budCo)
      setSelVersion(remaining[0]?.version_name ?? '')
    }
    setMsg('✅ Version supprimée')
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
    const result = produits.map((p, i) => p - charges[i])
    let cum = 0
    const cumul = result.map(v => { cum += v; return cum })
    return { charges, produits, result, cumul }
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

      {/* Company selector */}
      <div style={{ marginBottom: 16 }}>
        <select value={budCo} onChange={e => setBudCo(e.target.value)} style={inputSt}>
          {RAW.keys.map(k => <option key={k} value={k}>{RAW.companies[k]?.name || k}</option>)}
        </select>
      </div>

      {msg && <span style={{ fontSize:12, color: msg.startsWith('✅') ? '#10b981':'#ef4444', display:'block', marginBottom:8 }}>{msg}</span>}

      {/* Main layout: version list left, editor right */}
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* Left panel: version list */}
        <div style={{
          width: 220, flexShrink: 0,
          background: '#0a0f1a', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
          padding: '12px 10px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
            Versions
          </div>

          {coVersions.length === 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#334155', marginBottom: 10 }}>Aucune version</div>
              <button
                onClick={handleCreateAndGenerate}
                disabled={creating}
                style={{
                  width: '100%', padding: '8px 6px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(249,115,22,0.2))',
                  border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b',
                  lineHeight: 1.4, opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? 'Création...' : '⚡ Créer + Générer\ndepuis FEC N-1'}
              </button>
            </div>
          )}

          {coVersions.map(v => (
            <div key={v.version_name} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 8px', borderRadius: 7, marginBottom: 4,
              background: selVersion === v.version_name ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: `1px solid ${selVersion === v.version_name ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
              cursor: 'pointer',
            }}
              onClick={() => setSelVersion(v.version_name)}
            >
              <span style={{ flex: 1, fontSize: 12, color: selVersion === v.version_name ? '#93c5fd' : '#94a3b8', fontWeight: selVersion === v.version_name ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.version_name}
              </span>
              <button
                onClick={e => { e.stopPropagation(); handleDuplicateVersion(v.version_name) }}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                title="Dupliquer dans une nouvelle version"
              >
                📋
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteVersion(v.version_name) }}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                title="Supprimer"
              >
                ×
              </button>
            </div>
          ))}

          {/* New version input */}
          <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            <input
              type="text" placeholder="Nom de la version..." value={newVersionName}
              onChange={e => setNewVersionName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateVersion()}
              style={{ ...inputSt, width: '100%', boxSizing: 'border-box', marginBottom: 6, fontSize: 11 }}
            />
            <button
              onClick={handleCreateVersion}
              disabled={creating || !newVersionName.trim()}
              style={{ width: '100%', padding: '5px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd',
                opacity: creating || !newVersionName.trim() ? 0.5 : 1 }}
            >
              {creating ? 'Création...' : '+ Nouvelle version'}
            </button>
          </div>

          {/* Compare against another version */}
          {coVersions.length >= 2 && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                Comparer avec
              </div>
              <select
                value={compareVersion}
                onChange={e => setCompareVersion(e.target.value)}
                style={{ ...inputSt, width: '100%', boxSizing: 'border-box', fontSize: 11 }}
              >
                <option value="">— Aucune —</option>
                {coVersions
                  .filter(v => v.version_name !== selVersion)
                  .map(v => <option key={v.version_name} value={v.version_name}>{v.version_name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Right panel: budget editor */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {selVersion ? (
            <>
              {/* Toolbar */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>

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
                  <button onClick={() => setShowAddAccount(v => !v)}
                    style={{ padding:'6px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: showAddAccount ? 'rgba(16,185,129,0.2)' : 'transparent',
                      border: `1px solid ${showAddAccount ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      color: showAddAccount ? '#6ee7b7' : '#475569' }}>
                    {showAddAccount ? '× Annuler' : '+ Ajouter un compte'}
                  </button>
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
              </div>

              {/* Ajout d'un compte manuel (hors FEC) */}
              {showAddAccount && (
                <div style={{
                  marginBottom:16, padding:'14px 16px', borderRadius:12,
                  background:'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(20,184,166,0.06))',
                  border:'1px solid rgba(16,185,129,0.3)',
                  display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap',
                }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <label style={{ fontSize:10, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      N° de compte
                    </label>
                    <input
                      type="text" placeholder="ex : 6280001"
                      value={newAccNum} onChange={e => setNewAccNum(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
                      style={{ ...inputSt, width: 140 }}
                    />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1, minWidth:200 }}>
                    <label style={{ fontSize:10, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      Libellé
                    </label>
                    <input
                      type="text" placeholder="ex : Cotisation CCI"
                      value={newAccLabel} onChange={e => setNewAccLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
                      style={{ ...inputSt, width: '100%' }}
                    />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <label style={{ fontSize:10, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      Type
                    </label>
                    <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)' }}>
                      <button type="button" onClick={() => setNewAccType('c')}
                        style={{ padding:'6px 12px', fontSize:11, fontWeight:600, border:'none', cursor:'pointer',
                          background: newAccType === 'c' ? 'rgba(239,68,68,0.2)' : 'transparent',
                          color: newAccType === 'c' ? '#fca5a5' : '#475569' }}>
                        📤 Charge
                      </button>
                      <button type="button" onClick={() => setNewAccType('p')}
                        style={{ padding:'6px 12px', fontSize:11, fontWeight:600, border:'none', cursor:'pointer',
                          background: newAccType === 'p' ? 'rgba(16,185,129,0.2)' : 'transparent',
                          color: newAccType === 'p' ? '#6ee7b7' : '#475569' }}>
                        📥 Produit
                      </button>
                    </div>
                  </div>
                  <button onClick={handleAddAccount}
                    style={{ padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                      background:'rgba(16,185,129,0.25)', border:'1px solid rgba(16,185,129,0.4)', color:'#6ee7b7' }}>
                    Ajouter
                  </button>
                </div>
              )}

              {/* What-if simulation */}
              {showWhatIf && Object.keys(coBud).length > 0 && (
                <WhatIfPanel coBud={coBud} startMonth={startMonth} />
              )}

              {/* Comparaison de versions (#7 bis) */}
              {compareDiff && (
                <div style={{
                  marginBottom: 16, padding: '14px 16px', borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))',
                  border: '1px solid rgba(139,92,246,0.3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>📊</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Comparaison de versions</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          <span style={{ color: '#93c5fd' }}>{selVersion}</span>
                          <span style={{ margin: '0 6px' }}>vs</span>
                          <span style={{ color: '#a78bfa' }}>{compareVersion}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setCompareVersion('')}
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', fontSize: 10, padding: '4px 8px', borderRadius: 6 }}
                    >
                      Fermer
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                    {compareDiff.map(({ cat, label, curT, cmpT, diff, pctDiff }) => {
                      const pos = diff >= 0
                      const isCharge = cat !== 'ca'
                      const goodForBusiness = isCharge ? !pos : pos
                      return (
                        <div key={cat} style={{
                          padding: '10px 12px', borderRadius: 8,
                          background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>{label}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>
                            <span>{selVersion}</span>
                            <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{fmt(curT)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
                            <span>{compareVersion}</span>
                            <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{fmt(cmpT)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: 10, color: '#64748b' }}>Écart</span>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: goodForBusiness ? '#10b981' : '#ef4444' }}>
                                {pos ? '+' : ''}{fmt(diff)}
                              </div>
                              {pctDiff !== null && (
                                <div style={{ fontSize: 10, color: goodForBusiness ? '#10b981' : '#ef4444', opacity: 0.85 }}>
                                  {pos ? '+' : ''}{(pctDiff * 100).toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
                        {fiscalOrder.map(ai => (
                          <th key={ai} style={{ padding:'8px 4px', textAlign:'right', color:'#475569', fontWeight:600, minWidth:68, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{MONTHS_SHORT[ai]}</th>
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
                            {fiscalOrder.map(ai => (
                              <td key={ai} style={{ padding:'2px 2px' }}>
                                <input
                                  type="number" value={bv.b?.[ai] ?? 0}
                                  onChange={e => handleCell(acc, ai, e.target.value)}
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
                      {(() => {
                        // Cumul cumulatif dans l'ordre fiscal (pas calendaire)
                        let cum = 0
                        const fiscalCumul = fiscalOrder.map(ai => { cum += totals.result[ai]; return cum })
                        return [
                          { label:'📥 Total produits',  values: fiscalOrder.map(ai => totals.produits[ai]),  color:'#10b981', grandTotal: totals.produits.reduce((s,x)=>s+x,0) },
                          { label:'📤 Total charges',   values: fiscalOrder.map(ai => totals.charges[ai]),   color:'#ef4444', grandTotal: totals.charges.reduce((s,x)=>s+x,0)  },
                          { label:'💰 Résultat',        values: fiscalOrder.map(ai => totals.result[ai]),    color:'#3b82f6', grandTotal: totals.result.reduce((s,x)=>s+x,0)   },
                          { label:'📊 Résultat cumulé', values: fiscalCumul,                                 color:'#8b5cf6', grandTotal: fiscalCumul[fiscalCumul.length-1] ?? 0 },
                        ].map(({ label, values, color, grandTotal }) => (
                          <tr key={label} style={{ background: label.includes('cumulé') ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.025)', borderTop:'2px solid rgba(255,255,255,0.08)' }}>
                            <td style={{ padding:'7px 12px', fontWeight:700, color, fontSize:12 }}>{label}</td>
                            <td />
                            {values.map((v, d) => (
                              <td key={d} style={{ padding:'7px 4px', textAlign:'right', fontFamily:'monospace', fontWeight:600,
                                color: v<0 ? '#ef4444' : color }}>{fmt(v)}</td>
                            ))}
                            <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700,
                              color: grandTotal<0 ? '#ef4444':color }}>
                              {fmt(grandTotal)}
                            </td>
                          </tr>
                        ))
                      })()}
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding:32, borderRadius:12, background:'#0f172a', border:'1px solid rgba(255,255,255,0.06)', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>💰</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9', marginBottom:8 }}>Aucune version sélectionnée</div>
              <div style={{ fontSize:12, color:'#475569' }}>
                Créez une nouvelle version dans le panneau de gauche.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
