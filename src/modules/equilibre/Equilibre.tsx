import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { PlTable, KpiCard } from '@/components/ui'
import { EQ } from '@/lib/structure'
import { computePlCalc, fmt, monthIdx } from '@/lib/calc'

export function Equilibre() {
  const RAW = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)

  const allMonths = useMemo(() => [...new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])].sort(), [RAW?.mn?.join(','), RAW?.m1?.join(',')])
  const selectedMs = useMemo(() => {
    if (!filters.startM || !filters.endM) return RAW?.mn ?? []
    return allMonths.filter(m => monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM))
  }, [allMonths, filters.startM, filters.endM, RAW?.mn?.join(',')])
  const msSrc = useMemo(() => selectedMs.map(m => (RAW?.mn ?? []).includes(m) ? 'pn' as const : 'p1' as const), [selectedMs, RAW?.mn?.join(',')])
  const allMsN1Same = useMemo(() => selectedMs.map(m => `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`).filter(m => (RAW?.m1 ?? []).includes(m)), [selectedMs, RAW?.m1?.join(',')])
  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1Same.map(() => 'p1' as const), budData as any, EQ, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const actif = plCalc['eq_a']?.cumulN ?? 0
  const passif = plCalc['eq_p']?.cumulN ?? 0
  const bfr = (plCalc['clients_eq']?.cumulN ?? 0) + (plCalc['stocks']?.cumulN ?? 0) - (plCalc['fournisseurs_eq']?.cumulN ?? 0)

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-4">
        <KpiCard label="Actif économique" value={`${fmt(actif)} €`} color="#3b82f6" />
        <KpiCard label="Financement"      value={`${fmt(passif)} €`} color="#8b5cf6" />
        <KpiCard label="BFR"              value={`${fmt(bfr)} €`} color={bfr < 0 ? '#10b981' : '#f97316'} sub={bfr < 0 ? 'Favorable' : 'À financer'} />
        <KpiCard label="Écart actif/passif" value={`${fmt(actif - passif)} €`} color={Math.abs(actif-passif) < 1000 ? '#10b981' : '#ef4444'} />
      </div>
      <div className="px-2">
        <PlTable struct={EQ} plCalc={plCalc} RAW={RAW} selCo={filters.selCo} selectedMs={selectedMs}
          showMonths={filters.showMonths} showN1Full={filters.showN1Full} showBudget={false} caTotal={actif} />
      </div>
    </div>
  )
}
