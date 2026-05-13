import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { monthIdx } from '@/lib/calc'

/**
 * Hook partagé pour le filtrage des mois et l'alignement N / N-1.
 * Utilisé par CR, SIG, Equilibre, Ratios, Objectifs.
 */
export function usePeriodFilter() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const allMonths = useMemo(() =>
    [...new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? []), ...(RAW?.m2 ?? [])])].sort(),
    [RAW?.mn?.join(','), RAW?.m1?.join(','), RAW?.m2?.join(',')]
  )

  // Fallback : si rien n'est importé en N (mn vide) mais N-1 oui, on bascule sur N-1
  // pour que les écrans CR/SIG/Bilan ne soient pas vides. Le cas typique : un comptable
  // qui clôture 2025 en 2026 — `detectPeriod` classe le FEC en N-1 mais c'est "son" N.
  const defaultMs = useMemo(() => {
    if (RAW?.mn?.length) return RAW.mn
    if (RAW?.m1?.length) return RAW.m1
    return []
  }, [RAW?.mn?.join(','), RAW?.m1?.join(',')])

  const selectedMs = useMemo(() => {
    if (!filters.startM || !filters.endM) return defaultMs
    return allMonths.filter(m =>
      monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM)
    )
  }, [allMonths, filters.startM, filters.endM, defaultMs])

  const msSrc = useMemo(() =>
    selectedMs.map(m => (RAW?.mn ?? []).includes(m) ? 'pn' as const : 'p1' as const),
    [selectedMs, RAW?.mn?.join(',')]
  )

  const allMsN1Same = useMemo(() =>
    selectedMs.map(m => `${parseInt(m.slice(0, 4)) - 1}-${m.slice(5, 7)}`).filter(m => (RAW?.m1 ?? []).includes(m)),
    [selectedMs, RAW?.m1?.join(',')]
  )

  const allMsN1SameSrc = useMemo(() =>
    allMsN1Same.map(() => 'p1' as const),
    [allMsN1Same]
  )

  return { RAW, filters, selCo, allMonths, selectedMs, msSrc, allMsN1Same, allMsN1SameSrc }
}
