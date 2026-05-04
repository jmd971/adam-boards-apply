import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable, KpiCard, ExportBar, EcrituresModal } from '@/components/ui'
import { EQ } from '@/lib/structure'
import { computePlCalc, fmt, pct } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { exportPlCalcXlsx, printModule } from '@/lib/export'
import type { PlCalcRow, PlData, RAWData } from '@/types'
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts'

// Lit les données bilan (bn/b1) — classes 1-5 stockées séparément du P&L
// s = debit - credit (positif = actif, négatif = passif)
// sign=1 → soldes débiteurs uniquement (actif), sign=-1 → soldes créditeurs (passif), undefined → abs tous
function sumBilan(RAW: RAWData, selCo: string[], field: 'bn' | 'b1', prefixes: string[], sign?: 1 | -1): number {
  let t = 0
  for (const co of selCo) {
    const accts = RAW.companies[co]?.[field] ?? {}
    for (const [acc, data] of Object.entries(accts)) {
      if (prefixes.some(p => acc.startsWith(p))) {
        const sv = (data as any).s ?? 0
        if (sign === 1 && sv < 0) continue
        if (sign === -1 && sv > 0) continue
        t += Math.abs(sv)
      }
    }
  }
  return Math.round(t)
}

function computeEqCalc(RAW: RAWData, selCo: string[]): PlData {
  const s    = (f: 'bn' | 'b1', p: string[]) => sumBilan(RAW, selCo, f, p)
  const sPos = (f: 'bn' | 'b1', p: string[]) => sumBilan(RAW, selCo, f, p, 1)
  const sNeg = (f: 'bn' | 'b1', p: string[]) => sumBilan(RAW, selCo, f, p, -1)
  const mk = (n: number, n1: number): PlCalcRow => ({
    cumulN: n, cumulN1S: n1, cumulN1F: n1,
    monthsN: [], monthsN1: [], budMonths: Array(12).fill(0), budTotal: 0,
  })

  const immoN  = s('bn', ['20','21','22','23','26','27'])
  const immoN1 = s('b1', ['20','21','22','23','26','27'])
  const stN    = s('bn', ['31','32','33','34','35','36','37','38'])
  const stN1   = s('b1', ['31','32','33','34','35','36','37','38'])
  const clN    = s('bn', ['411','412','413','416'])
  const clN1   = s('b1', ['411','412','413','416'])
  // Autres actifs = soldes DÉBITEURS de class 4+5, hors clients déjà comptés
  const aaN    = sPos('bn', ['40','41','42','43','44','45','46','48','5']) - clN
  const aaN1   = sPos('b1', ['40','41','42','43','44','45','46','48','5']) - clN1
  const eqAN   = immoN + stN + clN + aaN
  const eqAN1  = immoN1 + stN1 + clN1 + aaN1

  const capN   = s('bn', ['10','11','12','13','14','15'])
  const capN1  = s('b1', ['10','11','12','13','14','15'])
  const detN   = s('bn', ['16'])
  const detN1  = s('b1', ['16'])
  const foN    = s('bn', ['401','402','403','404','405'])
  const foN1   = s('b1', ['401','402','403','404','405'])
  // Autres passifs = soldes CRÉDITEURS de class 42-48 (hors fourn déjà comptés)
  const apN    = sNeg('bn', ['42','43','44','45','46','48'])
  const apN1   = sNeg('b1', ['42','43','44','45','46','48'])
  const eqPN   = capN + detN + foN + apN
  const eqPN1  = capN1 + detN1 + foN1 + apN1

  return {
    immo:            mk(immoN,  immoN1),
    stocks:          mk(stN,    stN1),
    clients_eq:      mk(clN,    clN1),
    autr_act:        mk(aaN,    aaN1),
    eq_a:            mk(eqAN,   eqAN1),
    cap_prop:        mk(capN,   capN1),
    det_fin:         mk(detN,   detN1),
    fournisseurs_eq: mk(foN,    foN1),
    autr_pass:       mk(apN,    apN1),
    eq_p:            mk(eqPN,   eqPN1),
    eq_achats:       mk(0, 0),
  }
}

const WaterfallTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const displayVal = d.rawValue
  const color = d.isTotal ? '#3b82f6' : (d.isPositive ? '#10b981' : '#ef4444')
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'10px 14px', fontSize:11, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
      <div style={{ fontWeight:700, color:'var(--text-0)', marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:'monospace', fontWeight:600, color }}>
        {displayVal > 0 && !d.isTotal ? '+' : ''}{fmt(displayVal)} €
      </div>
      {d.isTotal && <div style={{ fontSize:10, color:'var(--text-3)', marginTop:2 }}>Cumul</div>}
    </div>
  )
}

function BfrGauge({ bfr, ca }: { bfr: number; ca: number }) {
  const ratio = ca > 0 ? bfr / ca : 0
  const clamp = Math.max(-0.3, Math.min(0.3, ratio))
  const pctPos = ((clamp + 0.3) / 0.6) * 100
  const color = bfr <= 0 ? '#10b981' : bfr / Math.max(ca, 1) < 0.1 ? '#f59e0b' : '#ef4444'

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Jauge BFR / CA</h3>
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="w-full relative" style={{ height: 28, background: 'rgba(255,255,255,0.06)', borderRadius: 14 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden',
            background: 'linear-gradient(to right, #10b981 0%, #10b981 40%, #f59e0b 50%, #ef4444 100%)',
            opacity: 0.15,
          }} />
          <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 1, background: 'rgba(255,255,255,0.3)' }} />
          <div style={{
            position: 'absolute',
            left: `${pctPos}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 16, height: 16,
            borderRadius: '50%',
            background: color,
            border: '2px solid rgba(255,255,255,0.3)',
            boxShadow: `0 0 12px ${color}60`,
            transition: 'left 0.5s ease',
          }} />
        </div>
        <div className="w-full flex justify-between text-[10px]" style={{ color: 'var(--text-2)' }}>
          <span>BFR négatif (favorable)</span>
          <span>0</span>
          <span>BFR élevé (risque)</span>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold" style={{ color }}>{fmt(bfr)} €</div>
          <div className="text-xs" style={{ color: 'var(--text-2)' }}>{pct(ratio)} du CA</div>
        </div>
      </div>
    </div>
  )
}

export function Equilibre() {
  const printRef = useRef<HTMLDivElement>(null)
  const budData  = useAppStore(s => s.budData)
  const { RAW, filters, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc } = usePeriodFilter()

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    const eq = computeEqCalc(RAW, selCo)
    // eq_achats = achats (classe 6) : données P&L + budget
    const EQ_ACHATS = [{ id:'eq_achats', label:'Achats (pour BFR)', accs:['607','601','604','6071'], type:'charge' as const }]
    const plPart = computePlCalc(RAW, selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc, budData as any, EQ_ACHATS, filters.excludeOD)
    return { ...eq, ...plPart }
  }, [RAW, selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const [modal, setModal] = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)

  const actif        = plCalc['eq_a']?.cumulN ?? 0
  const passif       = plCalc['eq_p']?.cumulN ?? 0
  const immo         = plCalc['immo']?.cumulN ?? 0
  const stocks       = plCalc['stocks']?.cumulN ?? 0
  const clients      = plCalc['clients_eq']?.cumulN ?? 0
  const capProp      = plCalc['cap_prop']?.cumulN ?? 0
  const detFin       = plCalc['det_fin']?.cumulN ?? 0
  const fournisseurs = plCalc['fournisseurs_eq']?.cumulN ?? 0
  const bfr          = clients + stocks - fournisseurs

  const resourcesStables = Math.round(capProp + detFin)
  const fdr              = Math.round(resourcesStables - immo)
  const trNette          = Math.round(fdr - bfr)

  const wfData = useMemo(() => {
    let run = 0
    type Step = { name: string; delta?: number; total?: number; isTotal?: boolean }
    const steps: Step[] = [
      { name: 'Cap. propres',  delta: Math.round(capProp) },
      { name: 'Dettes fin.',   delta: Math.round(detFin) },
      { name: 'Res. stables',  total: resourcesStables, isTotal: true },
      { name: '— Immobi.',     delta: -Math.round(immo) },
      { name: 'FDR',           total: fdr, isTotal: true },
      { name: bfr >= 0 ? '— BFR' : '+ BFR (fav.)', delta: -Math.round(bfr) },
      { name: 'Tréso. nette',  total: trNette, isTotal: true },
    ]
    return steps.map(step => {
      if (step.isTotal) {
        const t = step.total ?? 0
        return { name: step.name, invisible: t >= 0 ? 0 : t, bar: Math.abs(t), rawValue: t, isTotal: true, isPositive: t >= 0 }
      }
      const d = step.delta ?? 0
      if (d >= 0) {
        const entry = { name: step.name, invisible: run, bar: d, rawValue: d, isTotal: false, isPositive: true }
        run += d
        return entry
      } else {
        const entry = { name: step.name, invisible: run + d, bar: Math.abs(d), rawValue: d, isTotal: false, isPositive: false }
        run += d
        return entry
      }
    })
  }, [capProp, detFin, immo, bfr, resourcesStables, fdr, trNette])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <div ref={printRef} className="flex flex-col gap-4 module-equilibre">
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportPlCalcXlsx('Equilibre', 'Équilibre', EQ, plCalc, actif)}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-4">
        <KpiCard label="Actif économique"   value={`${fmt(actif)} €`}          color="#3b82f6" />
        <KpiCard label="Financement"        value={`${fmt(passif)} €`}         color="#8b5cf6" />
        <KpiCard label="BFR"                value={`${fmt(bfr)} €`}            color={bfr < 0 ? '#10b981' : '#f97316'} sub={bfr < 0 ? 'Favorable' : 'À financer'} />
        <KpiCard label="Écart actif/passif" value={`${fmt(actif - passif)} €`} color={Math.abs(actif - passif) < 1000 ? '#10b981' : '#ef4444'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--text-2)' }}>Équilibre financier — cascade</h3>
          <div style={{ display:'flex', gap:16, marginBottom:10, fontSize:10, color:'var(--text-3)' }}>
            <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:'#10b981', marginRight:4 }}/>Flux positif</span>
            <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:'#ef4444', marginRight:4 }}/>Flux négatif</span>
            <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:'#3b82f6', marginRight:4 }}/>Cumul</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={wfData} barSize={44} margin={{ top:4, right:8, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
              <Bar dataKey="invisible" stackId="wf" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="bar" stackId="wf" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {wfData.map((entry, i) => (
                  <Cell key={i} fill={entry.isTotal ? '#3b82f6' : (entry.isPositive ? '#10b981' : '#ef4444')} fillOpacity={entry.isTotal ? 0.9 : 0.72} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <BfrGauge bfr={bfr} ca={actif} />
      </div>

      <div className="px-2">
        <PlTable
          struct={EQ} plCalc={plCalc} RAW={RAW} selCo={filters.selCo} selectedMs={selectedMs}
          showMonths={filters.showMonths} showN1Full={filters.showN1Full} showBudget={filters.showBudget} caTotal={actif}
          budData={budData as any}
          onOpenModal={(title, entries, _d, cumN, cumN1) => setModal({ title, entries, cumN, cumN1 })}
          maxHeight="calc(100vh - 200px)"
        />
      </div>

      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}
