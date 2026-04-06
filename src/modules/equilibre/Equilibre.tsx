import { useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { PlTable, KpiCard, ExportBar } from '@/components/ui'
import { EQ } from '@/lib/structure'
import { computePlCalc, fmt, pct } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { exportPlCalcXlsx, printModule } from '@/lib/export'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

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

function BfrGauge({ bfr, ca }: { bfr: number; ca: number }) {
  const ratio = ca > 0 ? bfr / ca : 0
  // Gauge from -30% to +30% of CA
  const clamp = Math.max(-0.3, Math.min(0.3, ratio))
  const pctPos = ((clamp + 0.3) / 0.6) * 100
  const color = bfr <= 0 ? '#10b981' : bfr / Math.max(ca, 1) < 0.1 ? '#f59e0b' : '#ef4444'

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Jauge BFR / CA</h3>
      <div className="flex flex-col items-center gap-3 py-2">
        {/* Gauge bar */}
        <div className="w-full relative" style={{ height: 28, background: 'rgba(255,255,255,0.06)', borderRadius: 14 }}>
          {/* Gradient background */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden',
            background: 'linear-gradient(to right, #10b981 0%, #10b981 40%, #f59e0b 50%, #ef4444 100%)',
            opacity: 0.15,
          }} />
          {/* Center line (BFR=0) */}
          <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 1, background: 'rgba(255,255,255,0.3)' }} />
          {/* Needle */}
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
        {/* Labels */}
        <div className="w-full flex justify-between text-[10px]" style={{ color: 'var(--text-2)' }}>
          <span>BFR négatif (favorable)</span>
          <span>0</span>
          <span>BFR élevé (risque)</span>
        </div>
        {/* Value */}
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
  const budData = useAppStore(s => s.budData)

  const { RAW, filters, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc } = usePeriodFilter()

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc, budData as any, EQ, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const actif = plCalc['eq_a']?.cumulN ?? 0
  const passif = plCalc['eq_p']?.cumulN ?? 0
  const immo = plCalc['immo']?.cumulN ?? 0
  const stocks = plCalc['stocks']?.cumulN ?? 0
  const clients = plCalc['clients_eq']?.cumulN ?? 0
  const autresAct = plCalc['autr_act']?.cumulN ?? 0
  const capProp = plCalc['cap_prop']?.cumulN ?? 0
  const detFin = plCalc['det_fin']?.cumulN ?? 0
  const fournisseurs = plCalc['fournisseurs_eq']?.cumulN ?? 0
  const autresPass = plCalc['autr_pass']?.cumulN ?? 0
  const bfr = clients + stocks - fournisseurs

  // Stacked bar data: actif vs passif breakdown
  const stackedData = useMemo(() => [
    {
      name: 'Actif',
      'Immobilisations': Math.round(immo),
      'Stocks': Math.round(stocks),
      'Créances clients': Math.round(clients),
      'Autres actifs': Math.round(autresAct),
    },
    {
      name: 'Passif',
      'Capitaux propres': Math.round(capProp),
      'Dettes financières': Math.round(detFin),
      'Fournisseurs': Math.round(fournisseurs),
      'Autres passifs': Math.round(autresPass),
    },
  ], [immo, stocks, clients, autresAct, capProp, detFin, fournisseurs, autresPass])

  const ACTIF_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#6366f1']
  const PASSIF_COLORS = ['#8b5cf6', '#f59e0b', '#ef4444', '#f97316']
  const actifKeys = ['Immobilisations', 'Stocks', 'Créances clients', 'Autres actifs']
  const passifKeys = ['Capitaux propres', 'Dettes financières', 'Fournisseurs', 'Autres passifs']
  const allKeys = [...actifKeys, ...passifKeys]
  const allColors = [...ACTIF_COLORS, ...PASSIF_COLORS]

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <div ref={printRef} className="flex flex-col gap-4 module-equilibre">
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportPlCalcXlsx('Equilibre', 'Équilibre', EQ, plCalc, actif)}
      />
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-4">
        <KpiCard label="Actif économique" value={`${fmt(actif)} €`} color="#3b82f6" />
        <KpiCard label="Financement" value={`${fmt(passif)} €`} color="#8b5cf6" />
        <KpiCard label="BFR" value={`${fmt(bfr)} €`} color={bfr < 0 ? '#10b981' : '#f97316'} sub={bfr < 0 ? 'Favorable' : 'À financer'} />
        <KpiCard label="Écart actif/passif" value={`${fmt(actif - passif)} €`} color={Math.abs(actif - passif) < 1000 ? '#10b981' : '#ef4444'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6">
        {/* Stacked bar: Actif vs Passif */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Structure Actif / Passif</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stackedData} barSize={60}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {allKeys.map((key, i) => (
                <Bar key={key} dataKey={key} stackId="a" fill={allColors[i]} radius={i === allKeys.length - 1 ? [4, 4, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* BFR Gauge */}
        <BfrGauge bfr={bfr} ca={actif} />
      </div>

      {/* Table */}
      <div className="px-2">
        <PlTable struct={EQ} plCalc={plCalc} RAW={RAW} selCo={filters.selCo} selectedMs={selectedMs}
          showMonths={filters.showMonths} showN1Full={filters.showN1Full} showBudget={false} caTotal={actif} />
      </div>
    </div>
  )
}
