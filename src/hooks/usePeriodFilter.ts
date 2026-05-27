import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { monthIdx, allSelectableMonths } from '@/lib/calc'

/**
 * Hook partagé pour le filtrage des mois et l'alignement N / N-1 / N-2.
 * Utilisé par CR, SIG, Equilibre, Ratios, Objectifs.
 */
export function usePeriodFilter() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // Mois sélectionnables = données (mn/m1/m2) + exercice N complet (projection budget des mois à venir).
  const allMonths = useMemo(() =>
    allSelectableMonths(RAW, fiscalSettings),
    [RAW?.mn?.join(','), RAW?.m1?.join(','), RAW?.m2?.join(','), RAW?.keys?.join(','), JSON.stringify(fiscalSettings)]
  )

  // Fallback en cascade : N → N-1 → N-2.
  // Permet d'afficher les données même si seul un FEC N-2 est importé.
  const defaultMs = useMemo(() => {
    if (RAW?.mn?.length) return RAW.mn
    if (RAW?.m1?.length) return RAW.m1
    if (RAW?.m2?.length) return RAW.m2
    return []
  }, [RAW?.mn?.join(','), RAW?.m1?.join(','), RAW?.m2?.join(',')])

  const selectedMs = useMemo(() => {
    if (!filters.startM || !filters.endM) return defaultMs
    return allMonths.filter(m =>
      monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM)
    )
  }, [allMonths, filters.startM, filters.endM, defaultMs])

  // Détermine la source des données pour chaque mois sélectionné : pn (N), p1 (N-1) ou p2 (N-2).
  const msSrc = useMemo(() =>
    selectedMs.map(m =>
      (RAW?.mn ?? []).includes(m) ? 'pn' as const :
      (RAW?.m1 ?? []).includes(m) ? 'p1' as const :
      'p2' as const
    ),
    [selectedMs, RAW?.mn?.join(','), RAW?.m1?.join(',')]
  )

  // Mois de comparaison (année précédente) : cherche d'abord en N-1, puis en N-2.
  const allMsN1Same = useMemo(() => {
    const mn1 = RAW?.m1 ?? [], mn2 = RAW?.m2 ?? []
    return selectedMs
      .map(m => `${parseInt(m.slice(0, 4)) - 1}-${m.slice(5, 7)}`)
      .filter(m => mn1.includes(m) || mn2.includes(m))
  }, [selectedMs, RAW?.m1?.join(','), RAW?.m2?.join(',')])

  const allMsN1SameSrc = useMemo(() => {
    const mn1 = RAW?.m1 ?? []
    return allMsN1Same.map(m => mn1.includes(m) ? 'p1' as const : 'p2' as const)
  }, [allMsN1Same, RAW?.m1?.join(',')])

  return { RAW, filters, selCo, allMonths, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc }
}
