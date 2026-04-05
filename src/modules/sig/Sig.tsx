import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { PlTable, EcrituresModal } from '@/components/ui'
import { SIG } from '@/lib/structure'
import { computePlCalc, fmt, monthIdx } from '@/lib/calc'

export function Sig() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const budData = useAppStore(s => s.budData)
  const [modal, setModal] = useState<{ title: string; entries: any[]; cumN: number; cumN1: number } | null>(null)

  const allMonths = useMemo(() => [...new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])].sort(), [RAW?.mn?.join(','), RAW?.m1?.join(',')])
  const selectedMs = useMemo(() => {
    if (!filters.startM || !filters.endM) return RAW?.mn ?? []
    return allMonths.filter(m => monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM))
  }, [allMonths, filters.startM, filters.endM, RAW?.mn?.join(',')])
  const msSrc       = useMemo(() => selectedMs.map(m => (RAW?.mn ?? []).includes(m) ? 'pn' as const : 'p1' as const), [selectedMs, RAW?.mn?.join(',')])
  const allMsN1Same = useMemo(() => selectedMs.map(m => `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`).filter(m => (RAW?.m1 ?? []).includes(m)), [selectedMs, RAW?.m1?.join(',')])

  const plCalc = useMemo(() => {
    if (!RAW) return {}
    return computePlCalc(RAW, filters.selCo, selectedMs, msSrc, allMsN1Same, allMsN1Same.map(() => 'p1' as const), budData as any, SIG, filters.excludeOD)
  }, [RAW, filters.selCo.join(','), selectedMs.join(','), budData, filters.excludeOD])

  const caTotal = plCalc['ca']?.cumulN ?? 0

  if (!RAW) return <div className="flex items-center justify-center h-64 text-muted text-sm">Aucune donnée. Importez un fichier FEC.</div>

  return (
    <>
      <div className="px-2 py-2">
        <PlTable
          struct={SIG} plCalc={plCalc} RAW={RAW} selCo={filters.selCo}
          selectedMs={selectedMs} showMonths={filters.showMonths}
          showN1Full={filters.showN1Full} showBudget={filters.showBudget ?? false} caTotal={caTotal}
          onOpenModal={(title, entries, _detailed, cumN, cumN1) => setModal({ title, entries, cumN, cumN1 })}
        />
      </div>
      {modal && <EcrituresModal {...modal} onClose={() => setModal(null)} />}
    </>
  )
}
