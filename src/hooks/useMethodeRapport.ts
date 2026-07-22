import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { buildMethodeRapport, type MethodeRapport } from '@/lib/methode'

/** Rapport Méthode AdamBoards pour la société sélectionnée (1ère de selCo, sinon 1ère du RAW).
 *  `period` (optionnel) restreint l'analyse à une plage de mois de l'exercice courant. */
export function useMethodeRapport(period?: { startM: string; endM: string } | null): MethodeRapport | null {
  const RAW            = useAppStore(s => s.RAW)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)
  const filters        = useAppStore(s => s.filters)

  const companyKey = (filters.selCo && filters.selCo.length > 0 ? filters.selCo[0] : RAW?.keys[0]) ?? ''
  const startM = period?.startM ?? ''
  const endM   = period?.endM ?? ''

  return useMemo(
    () => buildMethodeRapport(RAW, fiscalSettings, companyKey, startM && endM ? { period: { startM, endM } } : {}),
    [RAW, fiscalSettings, companyKey, startM, endM],
  )
}
