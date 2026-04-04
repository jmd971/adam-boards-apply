import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable, KpiCard } from '@/components/ui'
import { SIG } from '@/lib/structure'
import { computePlCalc, fmt, monthIdx } from '@/lib/calc'

export function Sig() {
  const { RAW, filters, budData } = useAppStore(s => ({
    RAW: s.RAW, filters: s.filters, budData: s.budData,
  }))
  const [showBudget] = useState(false)

  const allMonths = useMemo(() => {
    const ms = new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])
    return [...ms].sort()
  }, [RAW?.mn?.join(), RAW?.m1?.join()])

  const selectedMs = useMemo(() => {
    if (!filters.startM || !filters.endM) return RAW?.mn ?? []
    return allMonths.filter(m =>
      monthIdx(m) >= monthIdx(filters.startM) &&
      monthIdx(m) <= monthIdx(filters.endM)
    )
  }, [allMonths, filters.startM, filters.endM, RAW?.mn?.join()])

  const msSrc = useMemo(() =>
    selectedMs.map(m =>
      (RAW?.mn ?? []).includes(m) ? 'pn' as const
        : (RAW?.m1 ?? []).includes(m) ? 'p1' as const
        : 'bud' as const
    ), [selectedMs, RAW?.mn?.join(), RAW?.m1?.join()])

  const allMsN1Same = useMemo(() =>
    selectedMs
      .map(m => `${parseInt(m.slice(0, 4)) - 1}-${m.slice(5, 7)}`)
      .filter(m => (RAW?.m1 ?? []).includes(m)),
    [selectedMs, RAW?.m1?.join()])

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc,
      allMsN1Same, allMsN1Same.map(() => 'p1' as const),
      budData as any, SIG, filters.excludeOD)
  }, [RAW, filters.selCo, selectedMs.join(), msSrc.join(), budData, filters.excludeOD])

  const ca  = plCalc['ca']?.cumulN  ?? 0
  const va  = plCalc['va']?.cumulN  ?? 0
  const ebe = plCalc['ebe']?.cumulN ?? 0
  const re  = plCalc['re']?.cumulN  ?? 0

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucune donnée. Importez un fichier FEC depuis l'onglet Import.
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-4">
        <KpiCard label="CA Net"            value={`${fmt(ca)} €`}  color="#10b981" />
        <KpiCard label="Valeur ajoutée"    value={`${fmt(va)} €`}  color="#3b82f6"
          sub={ca ? `${((va / ca) * 100).toFixed(1)} % du CA` : ''} />
        <KpiCard label="EBE"               value={`${fmt(ebe)} €`} color="#f59e0b"
          sub={ca ? `${((ebe / ca) * 100).toFixed(1)} % du CA` : ''} />
        <KpiCard label="Rés. exploitation" value={`${fmt(re)} €`}  color={re >= 0 ? '#10b981' : '#ef4444'} />
      </div>
      <div className="px-2">
        <PlTable
          struct={SIG} plCalc={plCalc} RAW={RAW}
          selCo={filters.selCo} selectedMs={selectedMs}
          showMonths={filters.showMonths} showN1Full={filters.showN1Full}
          showBudget={showBudget} caTotal={ca}
        />
      </div>
    </div>
  )
}
