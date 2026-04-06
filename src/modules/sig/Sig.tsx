import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable, EcrituresModal, KpiCard, ExportBar } from '@/components/ui'
import { SIG } from '@/lib/structure'
import { computePlCalc, fmt, pct } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { exportPlCalcXlsx, printModule } from '@/lib/export'
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
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

const WATERFALL_STEPS = [
  { id: 'ca', label: 'CA', color: '#10b981' },
  { id: 'marge', label: 'Marge', color: '#8b5cf6' },
  { id: 'va', label: 'VA', color: '#3b82f6' },
  { id: 'ebe', label: 'EBE', color: '#f59e0b' },
  { id: 're', label: 'Rés. Exploit.', color: '#3b82f6' },
  { id: 'rc', label: 'Rés. Courant', color: '#8b5cf6' },
  { id: 'rnet', label: 'Rés. Net', color: '#ef4444' },
]

export function Sig() {
  const printRef = useRef<HTMLDivElement>(null)
  const budData = useAppStore(s => s.budData)
  const [modal, setModal] = useState<{ title: string; entries: any[]; cumN: number; cumN1: number } | null>(null)

  const { RAW, filters, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc } = usePeriodFilter()

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc, budData as any, SIG, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const caTotal = plCalc['ca']?.cumulN ?? 0

  // KPIs
  const ca = plCalc['ca']?.cumulN ?? 0
  const va = plCalc['va']?.cumulN ?? 0
  const ebe = plCalc['ebe']?.cumulN ?? 0
  const rnet = plCalc['rnet']?.cumulN ?? 0
  const txVA = ca > 0 ? va / ca : 0
  const txEBE = ca > 0 ? ebe / ca : 0

  // Waterfall chart data
  const waterfallData = useMemo(() => {
    return WATERFALL_STEPS.map(step => {
      const val = Math.round(plCalc[step.id]?.cumulN ?? 0)
      return { name: step.label, value: val, color: step.color, fill: val >= 0 ? step.color : '#ef4444' }
    })
  }, [plCalc])

  // Comparative N vs N-1 for each SIG
  const compareData = useMemo(() => {
    return WATERFALL_STEPS.map(step => ({
      name: step.label,
      N: Math.round(plCalc[step.id]?.cumulN ?? 0),
      'N-1': Math.round(plCalc[step.id]?.cumulN1S ?? 0),
    }))
  }, [plCalc])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <div ref={printRef} className="module-sig">
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportPlCalcXlsx('SIG', 'SIG', SIG, plCalc, caTotal)}
      />
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 pt-4">
        <KpiCard label="Chiffre d'affaires" value={`${fmt(ca)} €`} color="#10b981" />
        <KpiCard label="Valeur Ajoutée" value={`${fmt(va)} €`} color="#3b82f6"
          sub={`${pct(txVA)} du CA`} />
        <KpiCard label="EBE" value={`${fmt(ebe)} €`} color="#f59e0b"
          sub={`${pct(txEBE)} du CA`} />
        <KpiCard label="Résultat Net" value={`${fmt(rnet)} €`} color={rnet >= 0 ? '#10b981' : '#ef4444'} />
        <KpiCard label="Taux VA / CA" value={pct(txVA)} color={txVA >= 0.3 ? '#10b981' : '#f97316'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 pt-4">
        {/* Waterfall */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Cascade des Soldes Intermédiaires (N)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={waterfallData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
              <Bar dataKey="value" name="Montant" radius={[4, 4, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Comparative N vs N-1 */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Comparaison N / N-1</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={compareData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
              <Bar dataKey="N" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="N-1" fill="#6366f1" opacity={0.5} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="px-2 py-2">
        <PlTable
          struct={SIG} plCalc={plCalc} RAW={RAW} selCo={filters.selCo}
          selectedMs={selectedMs} showMonths={filters.showMonths}
          showN1Full={filters.showN1Full} showBudget={false} caTotal={caTotal}
          onOpenModal={(title, entries, _detailed, cumN, cumN1) => setModal({ title, entries, cumN, cumN1 })}
        />
      </div>
      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}
