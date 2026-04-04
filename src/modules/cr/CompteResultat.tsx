import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable } from '@/components/ui'
import { KpiCard } from '@/components/ui'
import { CR } from '@/lib/structure'
import { computePlCalc, fmt, monthIdx } from '@/lib/calc'

export function CompteResultat() {
  const { RAW, filters, budData } = useAppStore(s => ({
    RAW: s.RAW,
    filters: s.filters,
    budData: s.budData,
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
    ),
    [selectedMs, RAW?.mn?.join(), RAW?.m1?.join()]
  )

  // N-1 même période
  const allMsN1Same = useMemo(() => {
    return selectedMs
      .map(m => `${parseInt(m.slice(0, 4)) - 1}-${m.slice(5, 7)}`)
      .filter(m => (RAW?.m1 ?? []).includes(m))
  }, [selectedMs, RAW?.m1?.join()])

  const allMsN1SameSrc = useMemo(() =>
    allMsN1Same.map(() => 'p1' as const),
    [allMsN1Same]
  )

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(
      RAW, filters.selCo, selectedMs, msSrc,
      allMsN1Same, allMsN1SameSrc,
      budData as any, CR, filters.excludeOD
    )
  }, [RAW, filters.selCo, selectedMs.join(), msSrc.join(), budData, filters.excludeOD])

  const caTotal = plCalc['ca_v']?.cumulN ?? 0
  const rnet    = plCalc['rnet_cr']?.cumulN ?? 0
  const charges = (plCalc['sal']?.cumulN ?? 0) + (plCalc['cs']?.cumulN ?? 0)

  if (!RAW) return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      Aucune donnée. Importez un fichier FEC depuis l'onglet Import.
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-4">
        <KpiCard label="Chiffre d'affaires"  value={`${fmt(caTotal)} €`} color="#10b981" />
        <KpiCard label="Résultat net"         value={`${fmt(rnet)} €`}    color={rnet >= 0 ? '#10b981' : '#ef4444'} />
        <KpiCard label="Charges personnel"   value={`${fmt(charges)} €`} color="#f97316" />
        <KpiCard label="Mois analysés"        value={String(selectedMs.length)} color="#3b82f6"
          sub={selectedMs[0] ? `${selectedMs[0]} → ${selectedMs[selectedMs.length - 1]}` : ''} />
      </div>

      {/* Tableau */}
      <div className="px-2">
        <PlTable
          struct={CR}
          plCalc={plCalc}
          RAW={RAW}
          selCo={filters.selCo}
          selectedMs={selectedMs}
          showMonths={filters.showMonths}
          showN1Full={filters.showN1Full}
          showBudget={showBudget}
          caTotal={caTotal}
        />
      </div>
    </div>
  )
}
