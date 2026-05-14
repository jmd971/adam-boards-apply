import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { fmt, pct, monthIdx, fiscalIndex } from '@/lib/calc'
import { computeBilan } from '@/lib/bilan'
import { KpiCard, ObjectifsChart, ExplainModal } from '@/components/ui'
import type { Explanation } from '@/components/ui'
import { evalThreshold, formatThresholdValue } from '@/lib/alertThresholds'

// ── Dashboard KPI explanations ───────────────────────────────────────────────

const DASH_EXPLANATIONS: Record<string, Explanation> = {
  ca: {
    title: "Chiffre d'affaires (CA)",
    definition: "Montant total des ventes de biens et services réalisées sur la période sélectionnée. C'est l'indicateur de taille et d'activité commerciale de l'entreprise.",
    formula: "Comptes 70x (ventes de produits, marchandises et prestations)",
    reading: [
      { label: "En croissance vs N-1 : dynamique commerciale positive", color: "#10b981" },
      { label: "Stable : activité maintenue, surveiller la marge", color: "#f59e0b" },
      { label: "En baisse : analyser la cause (marché, clients, gamme)", color: "#ef4444" },
    ],
    tip: "Comparez toujours le CA à la même période N-1 pour éliminer la saisonnalité.",
  },
  marge: {
    title: "Marge brute",
    definition: "Part du chiffre d'affaires restant après déduction du coût d'achat des marchandises et matières premières. Mesure la rentabilité brute de l'activité commerciale ou de production.",
    formula: "Marge brute = CA − Achats consommés (60x)\nTaux de marge = Marge brute / CA × 100",
    reading: [
      { label: "> 40 % : excellent — forte compétitivité sur les coûts d'achat", color: "#10b981" },
      { label: "25–40 % : correct — surveillance des achats recommandée", color: "#f59e0b" },
      { label: "< 25 % : faible — pression sur les coûts ou problème de mix produit", color: "#ef4444" },
    ],
    tip: "Repères sectoriels : Commerce ~20–30 % · Industrie ~35–50 % · Services ~60–80 %",
  },
  ebe: {
    title: "Excédent Brut d'Exploitation (EBE)",
    definition: "Résultat de l'activité opérationnelle avant amortissements, intérêts et impôts. C'est le cash généré par l'exploitation courante. Indicateur clé de la capacité à rembourser les dettes et investir.",
    formula: "EBE = Marge brute − Services extérieurs (61x-62x) − Charges de personnel (641x-646x)\nTaux d'EBE = EBE / CA × 100",
    reading: [
      { label: "> 15 % du CA : excellent — très bonne rentabilité opérationnelle", color: "#10b981" },
      { label: "8–15 % du CA : correct — entreprise saine et profitable", color: "#f59e0b" },
      { label: "< 8 % ou négatif : à surveiller — marges tendues", color: "#ef4444" },
    ],
    tip: "L'EBE est souvent utilisé pour calculer la capacité de remboursement : Dettes / EBE idéalement < 3 ans.",
  },
  re: {
    title: "Résultat d'Exploitation (REX)",
    definition: "Bénéfice ou perte généré par l'activité principale de l'entreprise, après déduction des amortissements et provisions, mais avant les charges financières et l'impôt sur les sociétés.",
    formula: "REX = EBE − Dotations aux amortissements (681x)\n+ Autres produits d'exploitation − Autres charges d'exploitation",
    reading: [
      { label: "Positif : l'activité couvre ses coûts et génère un profit", color: "#10b981" },
      { label: "Proche de zéro : équilibre fragile, surveiller de près", color: "#f59e0b" },
      { label: "Négatif : perte opérationnelle — plan d'action nécessaire", color: "#ef4444" },
    ],
    tip: "Un REX positif mais un résultat net négatif signale des charges financières ou exceptionnelles importantes.",
  },
}

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const CHARGE_COLORS = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#6366f1','#3b82f6','#14b8a6']

const CA_ACCS    = ['706','7061','70611','707','708','7080']
const ACHAT_ACCS = ['601','602','604','607']
const SERV_ACCS  = ['61','62']
const PERS_ACCS  = ['641','642','645','646']
const AMORT_ACCS = ['681']

function sumAccs(RAW: any, selCo: string[], field: 'pn'|'p1'|'p2', month: string, prefixes: string[], charge = false): number {
  let total = 0
  for (const co of selCo) {
    const data = RAW.companies[co]?.[field] ?? {}
    for (const [acc, acct] of Object.entries(data)) {
      if (!prefixes.some((p: string) => acc.startsWith(p))) continue
      const mo = (acct as any)?.mo?.[month]
      if (!mo || !Array.isArray(mo)) continue
      total += charge ? Math.max(0, mo[0] - mo[1]) : Math.max(0, mo[1] - mo[0])
    }
  }
  return Math.round(total)
}

function computeKpis(RAW: any, selCo: string[], months: string[]) {
  let ca=0, caN1=0, ach=0, achN1=0, serv=0, servN1=0, pers=0, persN1=0, amrt=0, amrtN1=0
  for (const m of months) {
    const mN1 = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
    ca     += sumAccs(RAW, selCo, 'pn', m,   CA_ACCS)
    caN1   += sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
    ach    += sumAccs(RAW, selCo, 'pn', m,   ACHAT_ACCS, true)
    achN1  += sumAccs(RAW, selCo, 'p1', mN1, ACHAT_ACCS, true)
    serv   += sumAccs(RAW, selCo, 'pn', m,   SERV_ACCS,  true)
    servN1 += sumAccs(RAW, selCo, 'p1', mN1, SERV_ACCS,  true)
    pers   += sumAccs(RAW, selCo, 'pn', m,   PERS_ACCS,  true)
    persN1 += sumAccs(RAW, selCo, 'p1', mN1, PERS_ACCS,  true)
    amrt   += sumAccs(RAW, selCo, 'pn', m,   AMORT_ACCS, true)
    amrtN1 += sumAccs(RAW, selCo, 'p1', mN1, AMORT_ACCS, true)
  }
  const marge   = ca - ach
  const margeN1 = caN1 - achN1
  const ebe     = marge - serv - pers
  const ebeN1   = margeN1 - servN1 - persN1
  const re      = ebe - amrt
  const reN1    = ebeN1 - amrtN1
  const evo = (n: number, n1: number) => n1 !== 0 ? (n - n1) / Math.abs(n1) : null
  return { ca, caN1, ach, serv, pers, amrt, marge, ebe, re,
    evoCa:    caN1 > 0 ? (ca - caN1) / caN1 : null,
    evoMarge: evo(marge, margeN1),
    evoEbe:   evo(ebe, ebeN1),
    evoRe:    evo(re, reN1),
    txMarge: ca > 0 ? marge/ca : 0,
    txEbe:   ca > 0 ? ebe/ca   : 0,
    txRe:    ca > 0 ? re/ca    : 0,
  }
}

/** Compute KPIs for a given period field (pn, p1, p2) and its months */
function computeKpisPeriod(RAW: any, selCo: string[], field: 'pn'|'p1'|'p2', months: string[]) {
  let ca=0, ach=0, serv=0, pers=0, amrt=0
  for (const m of months) {
    ca   += sumAccs(RAW, selCo, field, m, CA_ACCS)
    ach  += sumAccs(RAW, selCo, field, m, ACHAT_ACCS, true)
    serv += sumAccs(RAW, selCo, field, m, SERV_ACCS,  true)
    pers += sumAccs(RAW, selCo, field, m, PERS_ACCS,  true)
    amrt += sumAccs(RAW, selCo, field, m, AMORT_ACCS, true)
  }
  const marge = ca - ach
  const ebe   = marge - serv - pers
  const re    = ebe - amrt
  return { ca, marge, ebe, re }
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'10px 14px', fontSize:11, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
      <div style={{ fontWeight:700, color:'var(--text-0)', marginBottom:6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
          <span style={{ color:'var(--text-2)', flex:1 }}>{p.name}</span>
          <span style={{ fontFamily:'monospace', fontWeight:600, color:p.color }}>{fmt(p.value)} €</span>
        </div>
      ))}
    </div>
  )
}

function ThresholdConfigPanel({ onClose }: { onClose: () => void }) {
  const thresholds = useAppStore(s => s.alertThresholds)
  const setThresholds = useAppStore(s => s.setAlertThresholds)
  const [draft, setDraft] = useState(thresholds)
  const dirty = JSON.stringify(draft) !== JSON.stringify(thresholds)

  const update = (id: string, field: 'warn' | 'bad', value: string) => {
    const v = parseFloat(value)
    if (isNaN(v)) return
    setDraft(prev => prev.map(t => t.id === id ? { ...t, [field]: v } : t))
  }

  const apply = () => { setThresholds(draft); onClose() }
  const reset = () => setDraft(thresholds)

  const inputSt: React.CSSProperties = {
    width: 64, padding: '4px 6px', borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', textAlign: 'right', outline: 'none',
  }

  return (
    <div className="print-hide" style={{
      background: 'var(--bg-1)', borderRadius: 'var(--radius-lg)', padding: '14px 16px',
      border: '1px solid var(--border-1)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
        Configuration des seuils d'alerte
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8 }}>
        {draft.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{ flex: 1, fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{t.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <span style={{ color: '#f59e0b' }}>W</span>
              <input type="number" step={t.unit === 'x' ? '0.1' : '1'} value={t.warn}
                onChange={e => update(t.id, 'warn', e.target.value)} style={inputSt} />
              <span style={{ color: '#ef4444', marginLeft: 4 }}>C</span>
              <input type="number" step={t.unit === 'x' ? '0.1' : '1'} value={t.bad}
                onChange={e => update(t.id, 'bad', e.target.value)} style={inputSt} />
              <span style={{ fontSize: 9, color: '#475569', minWidth: 30 }}>{t.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button onClick={apply} disabled={!dirty} style={{
          padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: dirty ? 'pointer' : 'not-allowed',
          background: dirty ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'rgba(255,255,255,0.05)',
          border: 'none', color: dirty ? '#fff' : '#475569', opacity: dirty ? 1 : 0.5,
        }}>
          Valider
        </button>
        <button onClick={reset} disabled={!dirty} style={{
          padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: dirty ? 'pointer' : 'not-allowed',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: dirty ? '#94a3b8' : '#334155',
        }}>
          Annuler
        </button>
        <span style={{ fontSize: 10, color: '#334155' }}>W = alerte (orange) · C = critique (rouge)</span>
      </div>
    </div>
  )
}

export function Dashboard() {
  const RAW         = useAppStore(s => s.RAW)
  const filters     = useAppStore(s => s.filters)
  const budVersions = useAppStore(s => s.budVersions)
  const budData       = useAppStore(s => s.budData)
  const setFilters  = useAppStore(s => s.setFilters)
  const printRef    = useRef<HTMLDivElement>(null)
  const [showThresholdConfig, setShowThresholdConfig] = useState(false)
  const [activeExpl, setActiveExpl] = useState<string | null>(null)

  const { showBudget, budVersionKey } = filters

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const selectedMs = useMemo(() => {
    if (!RAW?.mn?.length) return []
    if (!filters.startM || !filters.endM) return RAW.mn
    return RAW.mn.filter((m: string) =>
      monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM)
    )
  }, [RAW?.mn?.join(','), filters.startM, filters.endM])

  const kpis = useMemo(() => {
    if (!selectedMs.length) return null
    return computeKpis(RAW, selCo, selectedMs)
  }, [RAW, selCo.join(','), selectedMs.join(',')])

  const budKpis = useMemo(() => {
    if (!showBudget || !budVersionKey || !selectedMs.length) return null
    const [co, vn] = budVersionKey.split('|||')
    const version = budVersions.find(v => v.company_key === co && v.version_name === vn)
    if (!version) return null
    const data = version.data

    let ca = 0, ach = 0, serv = 0, pers = 0, amrt = 0
    for (const [acc, v] of Object.entries(data)) {
      const bv = v as { b: number[]; t: string }
      if (!bv.b) continue
      const isCa   = CA_ACCS.some(p => acc.startsWith(p))
      const isAch  = ACHAT_ACCS.some(p => acc.startsWith(p))
      const isServ = SERV_ACCS.some(p => acc.startsWith(p))
      const pers_check  = PERS_ACCS.some(p => acc.startsWith(p))
      const isAmrt = AMORT_ACCS.some(p => acc.startsWith(p))
      const total = bv.b.reduce((s: number, x: number) => s + x, 0)
      if (isCa)        ca   += total
      if (isAch)       ach  += total
      if (isServ)      serv += total
      if (pers_check)  pers += total
      if (isAmrt)      amrt += total
    }
    const marge = ca - ach
    const ebe   = marge - serv - pers
    const re    = ebe - amrt
    return { ca, marge, ebe, re }
  }, [showBudget, budVersionKey, budVersions, selectedMs])

  const monthlyData = useMemo(() => {
    if (!selectedMs.length) return []
    return selectedMs.map((m: string) => {
      const mN1  = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
      const caN  = sumAccs(RAW, selCo, 'pn', m, CA_ACCS)
      const caN1 = sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
      const ach  = sumAccs(RAW, selCo, 'pn', m, ACHAT_ACCS, true)
      const serv = sumAccs(RAW, selCo, 'pn', m, SERV_ACCS,  true)
      const pers = sumAccs(RAW, selCo, 'pn', m, PERS_ACCS,  true)
      const amrt = sumAccs(RAW, selCo, 'pn', m, AMORT_ACCS, true)
      const marge = caN - ach
      const ebe   = marge - serv - pers
      const re    = ebe - amrt
      return { month: MONTHS_SHORT[parseInt(m.slice(5))-1], m,
        'CA N': caN, 'CA N-1': caN1, Marge: marge, EBE: ebe, Résultat: re,
        'Budget CA': budKpis ? Math.round(budKpis.ca / selectedMs.length) : undefined,
      }
    })
  }, [RAW, selCo.join(','), selectedMs.join(','), budKpis])

  // ── Évolution mensuelle cumulée : réalisé vs budget ───────────────────────
  // Sert à voir le DRIFT par rapport au budget au fil de l'année (pas juste l'écart total)
  const cumulComparisonData = useMemo(() => {
    if (!selectedMs.length || !showBudget || !budVersionKey) return []
    const [co, vn] = budVersionKey.split('|||')
    const version = budVersions.find(v => v.company_key === co && v.version_name === vn)
    if (!version) return []

    // Budget par mois fiscal : somme des comptes CA pour chaque fi
    const budByMonth = new Array(12).fill(0)
    for (const [acc, v] of Object.entries(version.data)) {
      const bv = v as { b: number[]; t: string }
      if (!bv.b || !CA_ACCS.some(p => acc.startsWith(p))) continue
      bv.b.forEach((val, i) => { budByMonth[i] += val })
    }

    let realCumul = 0, budCumul = 0
    return selectedMs.map((m: string) => {
      const real = sumAccs(RAW, selCo, 'pn', m, CA_ACCS)
      const bud  = budByMonth[fiscalIndex(m)] ?? 0
      realCumul += real; budCumul += bud
      return {
        month: MONTHS_SHORT[parseInt(m.slice(5))-1],
        'Réalisé cumulé': Math.round(realCumul),
        'Budget cumulé':  Math.round(budCumul),
        'Écart':          Math.round(realCumul - budCumul),
      }
    })
  }, [RAW, selCo.join(','), selectedMs.join(','), showBudget, budVersionKey, budVersions])

  const chargesData = useMemo(() => {
    if (!selectedMs.length) return []
    const cats = [
      { name:'Achats',         prefixes:['60','601','607'],        color:CHARGE_COLORS[0] },
      { name:'Services ext.',  prefixes:['61','62'],               color:CHARGE_COLORS[1] },
      { name:'Impôts',         prefixes:['63'],                    color:CHARGE_COLORS[2] },
      { name:'Personnel',      prefixes:['641','642','645','646'], color:CHARGE_COLORS[3] },
      { name:'Amortissements', prefixes:['681'],                   color:CHARGE_COLORS[4] },
      { name:'Charges fin.',   prefixes:['66'],                    color:CHARGE_COLORS[5] },
      { name:'Autres',         prefixes:['65','67','68'],          color:CHARGE_COLORS[6] },
    ]
    return cats.map(cat => {
      let val = 0
      for (const m of selectedMs) val += sumAccs(RAW, selCo, 'pn', m, cat.prefixes, true)
      return { name: cat.name, value: Math.round(val), fill: cat.color }
    }).filter(c => c.value > 0)
  }, [RAW, selCo.join(','), selectedMs.join(',')])

  const bilan = useMemo(() => {
    if (!RAW || !selCo.length) return null
    return computeBilan(RAW, selCo)
  }, [RAW, selCo.join(',')])

  const alertThresholds = useAppStore(s => s.alertThresholds)

  const alertes = useMemo(() => {
    if (!kpis || !selectedMs.length) return []
    const list: { icon: string; title: string; msg: string; color: string; priority: number }[] = []
    const ca = kpis.ca
    const nbMonths = selectedMs.length || 12
    const bfrVal = bilan ? (bilan.n.stocks + bilan.n.clients - bilan.n.fournisseurs) : 0
    const bfrJours = ca > 0 ? (bfrVal / ca) * 365 * (nbMonths / 12) : 0
    const levierVal = bilan && bilan.n.capitaux > 0 ? bilan.n.detteFin / bilan.n.capitaux : 0
    const evoVal = kpis.evoCa !== null ? kpis.evoCa * 100 : null

    const ratioValues: Record<string, { value: number; display: string; detail: string }> = {
      txMarge:  { value: kpis.txMarge * 100,  display: pct(kpis.txMarge),  detail: `Marge : ${fmt(kpis.marge)} € / CA : ${fmt(ca)} €` },
      txEbe:    { value: kpis.txEbe * 100,    display: pct(kpis.txEbe),    detail: `EBE : ${fmt(kpis.ebe)} €` },
      txRnet:   { value: kpis.txRe * 100,     display: pct(kpis.txRe),     detail: `Résultat : ${fmt(kpis.re)} €` },
      txVA:     { value: ca > 0 ? ((kpis.marge - kpis.serv) / ca) * 100 : 0, display: ca > 0 ? pct((kpis.marge - kpis.serv) / ca) : '—', detail: `VA estimée sur la période` },
      bfrJours: { value: bfrJours,             display: `${Math.round(bfrJours)} jours`, detail: `BFR : ${fmt(bfrVal)} €` },
      levier:   { value: levierVal,            display: `${levierVal.toFixed(2)}x`,      detail: `Dettes : ${fmt(bilan?.n.detteFin ?? 0)} € / CP : ${fmt(bilan?.n.capitaux ?? 0)} €` },
      evoCa:    { value: evoVal ?? 0,          display: evoVal != null ? pct(kpis.evoCa!) : '—', detail: `N : ${fmt(ca)} € / N-1 : ${fmt(kpis.caN1)} €` },
    }

    for (const t of alertThresholds) {
      const rv = ratioValues[t.id]
      if (!rv) continue
      if (t.id === 'evoCa' && evoVal === null) continue
      const status = evalThreshold(rv.value, t)
      if (status === 'good') {
        list.push({ icon: '✅', priority: 3, title: `${t.label} : ${rv.display}`, color: 'var(--green)',
          msg: `${rv.detail} — Seuil OK (> ${formatThresholdValue(t.warn, t.unit)})` })
      } else if (status === 'warn') {
        list.push({ icon: '⚠️', priority: 1, title: `${t.label} : ${rv.display}`, color: 'var(--amber)',
          msg: `${rv.detail} — Seuil d'alerte : ${formatThresholdValue(t.warn, t.unit)}` })
      } else {
        list.push({ icon: '🔴', priority: 0, title: `${t.label} : ${rv.display}`, color: 'var(--red)',
          msg: `${rv.detail} — Seuil critique : ${formatThresholdValue(t.bad, t.unit)}` })
      }
    }

    list.push({ icon: '📊', priority: 4, title: 'Synthèse de la période', color: 'var(--blue)',
      msg: `CA : ${fmt(kpis.ca)} € · Marge : ${pct(kpis.txMarge)} · EBE : ${pct(kpis.txEbe)} · Résultat : ${fmt(kpis.re)} €` })

    return list.sort((a, b) => a.priority - b.priority).slice(0, 8)
  }, [RAW, selCo.join(','), selectedMs.join(','), kpis, bilan, alertThresholds])

  const hasN2 = (RAW?.m2?.length ?? 0) > 0
  const trendData = useMemo(() => {
    if (!RAW || !selectedMs.length) return null
    const kN  = computeKpisPeriod(RAW, selCo, 'pn', RAW.mn ?? [])
    const kN1 = computeKpisPeriod(RAW, selCo, 'p1', RAW.m1 ?? [])
    const kN2 = hasN2 ? computeKpisPeriod(RAW, selCo, 'p2', RAW.m2 ?? []) : null
    const fyN  = RAW.mn?.[0]?.slice(0, 4) ?? 'N'
    const fyN1 = RAW.m1?.[0]?.slice(0, 4) ?? 'N-1'
    const fyN2 = RAW.m2?.[0]?.slice(0, 4) ?? 'N-2'
    const metrics = [
      { key: "Chiffre d'affaires", N: kN.ca,    N1: kN1.ca,    N2: kN2?.ca },
      { key: 'Marge brute',        N: kN.marge,  N1: kN1.marge,  N2: kN2?.marge },
      { key: 'EBE',                N: kN.ebe,    N1: kN1.ebe,    N2: kN2?.ebe },
      { key: 'Résultat exploit.',  N: kN.re,     N1: kN1.re,     N2: kN2?.re },
    ]
    return { metrics, fyN, fyN1, fyN2, hasN2: !!kN2 }
  }, [RAW, selCo.join(','), selectedMs.join(','), hasN2])

  const totalCharges = chargesData.reduce((s, c) => s + c.value, 0)
  const tickFmt      = (v: number) => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)
  const lastLabel    = selectedMs.length ? MONTHS_SHORT[parseInt(selectedMs[selectedMs.length-1].slice(5))-1] : ''

  const handlePrint = () => {
    printRef.current?.classList.add('dashboard-print')
    window.print()
    setTimeout(() => printRef.current?.classList.remove('dashboard-print'), 500)
  }

  const forecastData = useMemo(() => {
    if (!RAW || !budData) return []
    const now = new Date()
    const forecastMs: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      forecastMs.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const MS_PREV = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
    const cos = filters.selCo.length ? filters.selCo : RAW.keys
    let cum = 0
    return forecastMs.map((m, mi) => {
      let enc = 0, dec = 0
      for (const co of cos) {
        const bd = (budData as any)[co] ?? {}
        const dC = Math.round(45 / 30)
        const dF = Math.round(30 / 30)
        const fiC = fiscalIndex(forecastMs[Math.max(0, mi - dC)])
        const fiF = fiscalIndex(forecastMs[Math.max(0, mi - dF)])
        for (const bv of Object.values(bd)) {
          const b = (bv as any).b ?? []
          const t = (bv as any).t
          if (t === 'p') enc += b[fiC] || 0
          if (t === 'c') dec += b[fiF] || 0
        }
      }
      enc = Math.round(enc); dec = Math.round(dec)
      const fl = enc - dec; cum += fl
      return { month: MS_PREV[parseInt(m.slice(5)) - 1], enc, dec, fl, cum }
    })
  }, [filters.selCo.join(','), budData, RAW])

  if (!RAW) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:16, color:'var(--text-2)' }}>
      <div style={{ fontSize:40 }}>📊</div>
      <div style={{ fontSize:16, fontWeight:700, color:'var(--text-0)' }}>Bienvenue sur Adam Boards</div>
      <div style={{ fontSize:13 }}>Importez un fichier FEC pour voir votre tableau de bord</div>
      <button onClick={() => useAppStore.getState().setTab('import')}
        style={{ padding:'10px 24px', borderRadius:10, background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }}>
        → Aller à l'import
      </button>
    </div>
  )

  return (
    <div ref={printRef} style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:12, color:'var(--text-2)' }}>
          {selCo.map(co => RAW.companies[co]?.name || co).join(' · ')}
          {selectedMs.length > 0 && ` · ${selectedMs.length} mois analysés`}
        </div>
        <div className="print-hide" style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => setShowThresholdConfig(v => !v)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:'var(--radius-md)', background: showThresholdConfig ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)', border:'1px solid var(--border-1)', color: showThresholdConfig ? '#93c5fd' : 'var(--text-1)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Seuils
          </button>
          <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:'var(--radius-md)', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border-1)', color:'var(--text-1)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            PDF
          </button>
          {/* Budget toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <select
              value={budVersionKey}
              onChange={e => setFilters({ budVersionKey: e.target.value })}
              style={{
                display: showBudget ? 'block' : 'none',
                padding:'5px 8px', borderRadius:6, border:'1px solid var(--border-1)',
                background:'var(--bg-0)', color:'var(--text-1)', fontSize:11, cursor:'pointer'
              }}
            >
              <option value="">— Choisir une version —</option>
              {budVersions.map(v => (
                <option key={`${v.company_key}|||${v.version_name}`} value={`${v.company_key}|||${v.version_name}`}>
                  {v.company_key} — {v.version_name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setFilters({ showBudget: !showBudget })}
              style={{
                padding:'7px 14px', borderRadius:'var(--radius-md)',
                background: showBudget ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${showBudget ? 'rgba(139,92,246,0.4)' : 'var(--border-1)'}`,
                color: showBudget ? '#c4b5fd' : 'var(--text-1)',
                fontSize:12, fontWeight:600, cursor:'pointer'
              }}
            >
              Budget
            </button>
          </div>
        </div>
      </div>

      {showThresholdConfig && <ThresholdConfigPanel onClose={() => setShowThresholdConfig(false)} />}

      {/* KPIs — trend arrows sur les 4 cartes */}
      <div className="print-kpis" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:12 }}>
        <KpiCard label="Chiffre d'affaires" value={`${fmt(kpis?.ca ?? 0)} €`} color="var(--green)"
          trend={kpis?.evoCa != null ? kpis.evoCa * 100 : undefined}
          sub={budKpis
            ? `Budget ${fmt(budKpis.ca)} € · Éc. ${kpis && kpis.ca >= budKpis.ca ? '+' : ''}${fmt((kpis?.ca ?? 0) - budKpis.ca)} €`
            : kpis?.caN1 ? `N-1 : ${fmt(kpis.caN1)} €` : undefined}
          tooltip={DASH_EXPLANATIONS.ca.definition}
          onInfo={() => setActiveExpl('ca')} />
        <KpiCard label="Marge brute" value={`${fmt(kpis?.marge ?? 0)} €`} color="var(--blue)"
          trend={kpis?.evoMarge != null ? kpis.evoMarge * 100 : undefined}
          sub={budKpis
            ? `Budget ${fmt(budKpis.marge)} € · Éc. ${kpis && kpis.marge >= budKpis.marge ? '+' : ''}${fmt((kpis?.marge ?? 0) - budKpis.marge)} €`
            : kpis ? `${pct(kpis.txMarge)} du CA` : undefined}
          tooltip={DASH_EXPLANATIONS.marge.definition}
          onInfo={() => setActiveExpl('marge')} />
        <KpiCard label="EBE" value={`${fmt(kpis?.ebe ?? 0)} €`}
          color={!kpis ? 'var(--blue)' : kpis.txEbe > 0.10 ? 'var(--green)' : kpis.txEbe > 0.05 ? 'var(--amber)' : 'var(--red)'}
          trend={kpis?.evoEbe != null ? kpis.evoEbe * 100 : undefined}
          sub={budKpis
            ? `Budget ${fmt(budKpis.ebe)} € · Éc. ${kpis && kpis.ebe >= budKpis.ebe ? '+' : ''}${fmt((kpis?.ebe ?? 0) - budKpis.ebe)} €`
            : kpis ? `${pct(kpis.txEbe)} du CA` : undefined}
          tooltip={DASH_EXPLANATIONS.ebe.definition}
          onInfo={() => setActiveExpl('ebe')} />
        <KpiCard label="Résultat exploit." value={`${fmt(kpis?.re ?? 0)} €`}
          color={!kpis ? 'var(--blue)' : kpis.re >= 0 ? 'var(--blue)' : 'var(--red)'}
          trend={kpis?.evoRe != null ? kpis.evoRe * 100 : undefined}
          sub={budKpis
            ? `Budget ${fmt(budKpis.re)} € · Éc. ${kpis && kpis.re >= budKpis.re ? '+' : ''}${fmt((kpis?.re ?? 0) - budKpis.re)} €`
            : kpis ? `${pct(kpis.txRe)} du CA` : undefined}
          tooltip={DASH_EXPLANATIONS.re.definition}
          onInfo={() => setActiveExpl('re')} />
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="print-alertes" style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'14px 16px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
            🔔 Alertes — {lastLabel || 'Période sélectionnée'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:8 }}>
            {alertes.map((a, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 12px', borderRadius:'var(--radius-sm)', background:`${a.color}0f`, border:`1px solid ${a.color}30` }}>
                <span style={{ fontSize:16, flexShrink:0, lineHeight:1.3 }}>{a.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:a.color, marginBottom:2 }}>{a.title}</div>
                  <div style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.5 }}>{a.msg}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Graphiques */}
      <div className="print-charts">

      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>📈 Évolution du CA — N vs N-1</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Line type="monotone" dataKey="CA N"   stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r:4 }} />
            <Line type="monotone" dataKey="CA N-1" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
            {showBudget && budKpis && (
              <Line type="monotone" dataKey="Budget CA" stroke="#c4b5fd" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16 }}>
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>📊 Marge · EBE · Résultat mensuels</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Bar dataKey="Marge"    fill="#3b82f6" opacity={0.8} radius={[3,3,0,0]} />
              <Bar dataKey="EBE"      fill="#f59e0b" opacity={0.85} radius={[3,3,0,0]} />
              <Bar dataKey="Résultat" fill="#10b981" opacity={0.9}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>🥧 Répartition des charges</div>
          {chargesData.length === 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:160, color:'var(--text-3)', fontSize:12 }}>Aucune charge détectée</div>
          ) : (
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:140, height:140, flexShrink:0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chargesData} cx="50%" cy="50%" innerRadius={30} outerRadius={60}
                      dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                      {chargesData.map((_, i) => <Cell key={i} fill={chargesData[i].fill} opacity={0.85} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${fmt(v)} €`]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                {chargesData.map(cat => (
                  <div key={cat.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:cat.fill, flexShrink:0 }} />
                    <span style={{ color:'var(--text-2)', flex:1 }}>{cat.name}</span>
                    <span style={{ fontFamily:'monospace', color:'var(--text-1)', fontWeight:600 }}>
                      {totalCharges > 0 ? pct(cat.value / totalCharges) : '—'}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid var(--border-0)', fontSize:10, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text-3)' }}>Total charges</span>
                  <span style={{ fontFamily:'monospace', color:'var(--text-0)', fontWeight:700 }}>{fmt(totalCharges)} €</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>🎯 Résultat d'exploitation mensuel</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
            <Bar dataKey="Résultat" radius={[3,3,0,0]}>
              {monthlyData.map((m: any, i: number) => (
                <Cell key={i} fill={m['Résultat'] >= 0 ? '#10b981' : '#ef4444'} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {trendData && (trendData.hasN2 || (RAW?.m1?.length ?? 0) > 0) && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
            {trendData.hasN2 ? '📅 Tendance 3 exercices' : '📅 Tendance N vs N-1'}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trendData.metrics.map(m => ({
              name: m.key,
              [trendData.fyN]: Math.round(m.N),
              [trendData.fyN1]: Math.round(m.N1),
              ...(trendData.hasN2 ? { [trendData.fyN2]: Math.round(m.N2 ?? 0) } : {}),
            }))} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              {trendData.hasN2 && <Bar dataKey={trendData.fyN2} fill="#64748b" opacity={0.5} radius={[3,3,0,0]} />}
              <Bar dataKey={trendData.fyN1} fill="#6366f1" opacity={0.7} radius={[3,3,0,0]} />
              <Bar dataKey={trendData.fyN} fill="#3b82f6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop:12, overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr>
                  <th style={{ padding:'6px 10px', textAlign:'left', color:'#64748b', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>Indicateur</th>
                  {trendData.hasN2 && <th style={{ padding:'6px 10px', textAlign:'right', color:'#64748b', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{trendData.fyN2}</th>}
                  <th style={{ padding:'6px 10px', textAlign:'right', color:'#6366f1', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{trendData.fyN1}</th>
                  <th style={{ padding:'6px 10px', textAlign:'right', color:'#3b82f6', fontWeight:700, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{trendData.fyN}</th>
                  <th style={{ padding:'6px 10px', textAlign:'right', color:'#64748b', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>Var. N/N-1</th>
                </tr>
              </thead>
              <tbody>
                {trendData.metrics.map(m => {
                  const varAmt = m.N - m.N1
                  const varPctVal = m.N1 !== 0 ? varAmt / Math.abs(m.N1) : null
                  return (
                    <tr key={m.key} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding:'6px 10px', color:'#94a3b8', fontWeight:600 }}>{m.key}</td>
                      {trendData.hasN2 && <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'monospace', color:'#64748b' }}>{fmt(m.N2 ?? 0)} €</td>}
                      <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'monospace', color:'#94a3b8' }}>{fmt(m.N1)} €</td>
                      <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'monospace', color:'#f1f5f9', fontWeight:700 }}>{fmt(m.N)} €</td>
                      <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color: varAmt >= 0 ? '#10b981' : '#ef4444' }}>
                        {varAmt >= 0 ? '+' : ''}{fmt(varAmt)} € {varPctVal != null ? `(${varPctVal >= 0 ? '+' : ''}${pct(varPctVal)})` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kpis && budKpis && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
            🎯 Réalisation des objectifs
          </div>
          <ObjectifsChart
            hasBudget={!!budKpis}
            height={280}
            kpis={[
              { label:"CA",             icon:'💰', color:'#10b981', real: kpis.ca,    bud: budKpis.ca    },
              { label:"Marge brute",    icon:'📊', color:'#3b82f6', real: kpis.marge, bud: budKpis.marge },
              { label:"EBE",            icon:'💹', color:'#f59e0b', real: kpis.ebe,   bud: budKpis.ebe   },
              { label:"Rés. exploit.",  icon:'🎯', color:'#8b5cf6', real: kpis.re,    bud: budKpis.re    },
            ]}
          />
        </div>
      )}

      {/* Évolution mensuelle cumulée : réalisé vs budget */}
      {cumulComparisonData.length > 0 && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
            📈 Évolution mensuelle — Réalisé vs Budget cumulé
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={cumulComparisonData} margin={{ top:4, right:16, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-3)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-3)', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <Line type="monotone" dataKey="Réalisé cumulé" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r:4 }} />
              <Line type="monotone" dataKey="Budget cumulé"  stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              <Line type="monotone" dataKey="Écart"          stroke="#f59e0b" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize:10, color:'var(--text-3)', marginTop:6, textAlign:'center' }}>
            Vert = CA réalisé cumulé · Violet pointillé = budget cumulé · Orange = écart (positif = on dépasse le budget)
          </div>
        </div>
      )}

      {forecastData.some(d => d.enc > 0 || d.dec > 0) && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
            💧 Trésorerie prévisionnelle — 12 mois
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={forecastData} margin={{ top:4, right:16, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-3)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text-3)', fontSize:10 }} axisLine={false} tickLine={false} width={72}
                tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} />
              <Tooltip
                contentStyle={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 }}
                formatter={(v: any, name: string) => [
                  new Intl.NumberFormat('fr-FR').format(v) + ' €',
                  name === 'enc' ? 'Encaissements' : name === 'dec' ? 'Décaissements' : name === 'fl' ? 'Flux net' : 'Trésorerie cumulée'
                ]}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Line type="monotone" dataKey="enc" stroke="#10b981" strokeWidth={2} dot={false} name="enc" />
              <Line type="monotone" dataKey="dec" stroke="#ef4444" strokeWidth={2} dot={false} name="dec" />
              <Line type="monotone" dataKey="fl" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="fl" />
              <Line type="monotone" dataKey="cum" stroke="#a78bfa" strokeWidth={2.5} dot={{ r:3, fill:'#a78bfa' }} name="cum" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:10, flexWrap:'wrap' }}>
            {([['#10b981','Encaissements'],['#ef4444','Décaissements'],['#3b82f6','Flux net (pointillé)'],['#a78bfa','Trésorerie cumulée']] as const).map(([color,label]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--text-3)' }}>
                <div style={{ width:16, height:2, background:color as string, borderRadius:2 }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      </div>

      {/* Explanation modal */}
      {activeExpl && DASH_EXPLANATIONS[activeExpl] && (
        <ExplainModal expl={DASH_EXPLANATIONS[activeExpl]} onClose={() => setActiveExpl(null)} />
      )}
    </div>
  )
}
