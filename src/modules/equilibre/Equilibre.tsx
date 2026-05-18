import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable, KpiCard, ExportBar, EcrituresModal } from '@/components/ui'
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

export function Equilibre() {
  const printRef = useRef<HTMLDivElement>(null)
  const budData = useAppStore(s => s.budData)
  const [modal, setModal] = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)

  const { RAW, filters, selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc } = usePeriodFilter()

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc, budData as any, EQ, filters.excludeOD)
  }, [RAW, selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const ventes   = plCalc['tot_ventes']?.cumulN ?? 0
  const achats   = plCalc['tot_achats']?.cumulN ?? 0
  const marge    = plCalc['marge_eq']?.cumulN ?? 0
  const charges  = plCalc['tot_charges_eq']?.cumulN ?? 0
  const resultat = plCalc['resultat_eq']?.cumulN ?? 0
  const tauxMarge = ventes !== 0 ? marge / ventes : 0

  // Données graphique
  const chartData = useMemo(() => [
    { name: 'Ventes',   N: Math.round(ventes),   'N-1': Math.round(plCalc['tot_ventes']?.cumulN1S ?? 0) },
    { name: 'Achats',   N: Math.round(achats),   'N-1': Math.round(plCalc['tot_achats']?.cumulN1S ?? 0) },
    { name: 'Marge',    N: Math.round(marge),     'N-1': Math.round((plCalc['tot_ventes']?.cumulN1S ?? 0) - (plCalc['tot_achats']?.cumulN1S ?? 0)) },
    { name: 'Charges',  N: Math.round(charges),   'N-1': Math.round(plCalc['tot_charges_eq']?.cumulN1S ?? 0) },
    { name: 'Résultat', N: Math.round(resultat),  'N-1': Math.round((plCalc['tot_ventes']?.cumulN1S ?? 0) - (plCalc['tot_achats']?.cumulN1S ?? 0) - (plCalc['tot_charges_eq']?.cumulN1S ?? 0)) },
  ], [ventes, achats, marge, charges, resultat, plCalc])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <div ref={printRef} className="flex flex-col gap-4 module-equilibre">
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportPlCalcXlsx('Equilibre', 'Équilibre exploitation', EQ, plCalc, ventes)}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 pt-4">
        <KpiCard label="Ventes" value={`${fmt(ventes)} €`} color="#10b981" />
        <KpiCard label="Achats" value={`${fmt(achats)} €`} color="#f97316" />
        <KpiCard label="Marge brute" value={`${fmt(marge)} €`} color="#14b8a6" sub={`${pct(tauxMarge)} du CA`} />
        <KpiCard label="Charges" value={`${fmt(charges)} €`} color="#ef4444" />
        <KpiCard label="Résultat net" value={`${fmt(resultat)} €`} color={resultat >= 0 ? '#3b82f6' : '#ef4444'} />
      </div>

      {/* Graphique N vs N-1 */}
      <div className="px-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Ventes → Marge → Résultat (N vs N-1)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="N" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
              <Bar dataKey="N-1" fill="#475569" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Formule visuelle */}
      <div className="px-6">
        <div className="flex items-center justify-center gap-3 py-3 text-sm font-bold" style={{ color: 'var(--text-2)' }}>
          <span style={{ color:'#10b981' }}>Ventes {fmt(ventes)}</span>
          <span>−</span>
          <span style={{ color:'#f97316' }}>Achats {fmt(achats)}</span>
          <span>=</span>
          <span style={{ color:'#14b8a6' }}>Marge {fmt(marge)}</span>
          <span>−</span>
          <span style={{ color:'#ef4444' }}>Charges {fmt(charges)}</span>
          <span>=</span>
          <span style={{ color: resultat >= 0 ? '#3b82f6' : '#ef4444', fontSize:16 }}>Résultat {fmt(resultat)}</span>
        </div>
      </div>

      {/* Table détaillée avec catégories/sous-catégories dépliables */}
      <div className="px-2">
        <PlTable struct={EQ} plCalc={plCalc} RAW={RAW} selCo={selCo} selectedMs={selectedMs} msSrc={msSrc}
          showMonths={filters.showMonths} showN1Full={filters.showN1Full} showBudget={filters.showBudget} caTotal={ventes}
          collapsible
          onOpenModal={(title, entries, _, cumN, cumN1) => setModal({title, entries, cumN, cumN1})} />
      </div>

      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}
