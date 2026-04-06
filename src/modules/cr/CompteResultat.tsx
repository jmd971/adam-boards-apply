import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable, EcrituresModal, KpiCard, ExportBar } from '@/components/ui'
import { CR } from '@/lib/structure'
import { computePlCalc, fmt, pct } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { exportPlCalcXlsx, printModule } from '@/lib/export'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

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

export function CompteResultat() {
  const printRef = useRef<HTMLDivElement>(null)
  const budData = useAppStore(s => s.budData)
  const [modal, setModal] = useState<{ title: string; entries: any[]; cumN: number; cumN1: number } | null>(null)

  const { RAW, filters, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc } = usePeriodFilter()

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc, budData as any, CR, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const caTotal = plCalc['ca_v']?.cumulN ?? plCalc['ca']?.cumulN ?? 0

  // KPI data
  const totalProduits = (plCalc['ca_v']?.cumulN ?? 0) + (plCalc['ca_p']?.cumulN ?? 0) + (plCalc['ca_a']?.cumulN ?? 0) + (plCalc['sub_exp']?.cumulN ?? 0) + (plCalc['autr_prod']?.cumulN ?? 0)
  const totalCharges = (plCalc['achat_mdse']?.cumulN ?? 0) + (plCalc['achat_mp']?.cumulN ?? 0) + (plCalc['soustr']?.cumulN ?? 0) + (plCalc['serv_ext']?.cumulN ?? 0) + (plCalc['impots']?.cumulN ?? 0) + (plCalc['sal']?.cumulN ?? 0) + (plCalc['cs']?.cumulN ?? 0) + (plCalc['amor']?.cumulN ?? 0) + (plCalc['autr_ch']?.cumulN ?? 0) + (plCalc['is_cr']?.cumulN ?? 0)
  const rnet = plCalc['rnet_cr']?.cumulN ?? 0
  const rnetN1 = plCalc['rnet_cr']?.cumulN1S ?? 0
  const txMarge = totalProduits > 0 ? rnet / totalProduits : 0

  // Bar chart: N vs N-1 aggregates
  const compareData = useMemo(() => {
    const rows = [
      { id: 'ca_v', label: 'CA Ventes' },
      { id: 'ca_p', label: 'CA Services' },
      { id: 'serv_ext', label: 'Serv. ext.' },
      { id: 'sal', label: 'Salaires' },
      { id: 'cs', label: 'Ch. sociales' },
      { id: 'rnet_cr', label: 'Résultat' },
    ]
    return rows.map(r => ({
      name: r.label,
      N: Math.round(plCalc[r.id]?.cumulN ?? 0),
      'N-1': Math.round(plCalc[r.id]?.cumulN1S ?? 0),
    }))
  }, [plCalc])

  // Monthly result line
  const monthlyResult = useMemo(() => {
    const mN = plCalc['rnet_cr']?.monthsN ?? []
    const mN1 = plCalc['rnet_cr']?.monthsN1 ?? []
    return selectedMs.map((m, i) => ({
      month: MONTHS_SHORT[parseInt(m.slice(5)) - 1],
      'Résultat N': Math.round(mN[i] ?? 0),
      'Résultat N-1': Math.round(mN1[i] ?? 0),
    }))
  }, [plCalc, selectedMs])

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <div ref={printRef} className="module-cr">
      <ExportBar
        onPdf={() => printModule(printRef, 'module-print')}
        onExcel={() => exportPlCalcXlsx('CompteResultat', 'CR', CR, plCalc, caTotal)}
      />
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-4">
        <KpiCard label="Total Produits" value={`${fmt(totalProduits)} €`} color="#10b981" />
        <KpiCard label="Total Charges" value={`${fmt(totalCharges)} €`} color="#ef4444" />
        <KpiCard label="Résultat Net" value={`${fmt(rnet)} €`} color={rnet >= 0 ? '#10b981' : '#ef4444'}
          sub={rnetN1 !== 0 ? `N-1 : ${fmt(rnetN1)} €` : undefined} />
        <KpiCard label="Taux de marge nette" value={pct(txMarge)} color={txMarge >= 0.05 ? '#10b981' : '#f97316'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 pt-4">
        {/* Bar chart N vs N-1 */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Comparaison N / N-1</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compareData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="N" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="N-1" fill="#6366f1" opacity={0.5} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line chart monthly result */}
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg, #111827)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-2)' }}>Évolution mensuelle du Résultat Net</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyResult}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="Résultat N" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Résultat N-1" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="px-2 py-2">
        <PlTable
          struct={CR} plCalc={plCalc} RAW={RAW} selCo={filters.selCo}
          selectedMs={selectedMs} showMonths={filters.showMonths}
          showN1Full={filters.showN1Full} showBudget={false} caTotal={caTotal}
          onOpenModal={(title, entries, _detailed, cumN, cumN1) => setModal({ title, entries, cumN, cumN1 })}
        />
      </div>
      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}
