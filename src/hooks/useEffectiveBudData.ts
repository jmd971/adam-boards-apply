import { useMemo } from 'react'
import { useAppStore } from '@/store'

/**
 * Renvoie le budData "effectif" pour les pages d'analyse :
 * - Si filters.budVersionKey est défini (format "company_key|||version_name"),
 *   remplace budData[co] par la version sélectionnée.
 * - Sinon, renvoie budData tel quel (la version active courante).
 *
 * Permet à la TopBar de basculer entre versions de budget sans réécrire
 * la version active dans le store.
 */
export function useEffectiveBudData(): Record<string, any> {
  const budData       = useAppStore(s => s.budData)
  const budVersions   = useAppStore(s => s.budVersions)
  const budVersionKey = useAppStore(s => s.filters.budVersionKey)

  return useMemo(() => {
    if (!budVersionKey) return budData
    const [co, vn] = budVersionKey.split('|||')
    const version = budVersions.find(v => v.company_key === co && v.version_name === vn)
    if (!version) return budData
    return { ...budData, [co]: version.data }
  }, [budData, budVersions, budVersionKey])
}
