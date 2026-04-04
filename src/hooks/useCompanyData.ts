import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { sb } from '@/lib/supabase'
import { buildRAW } from '@/lib/calc'
import { useAppStore } from '@/store'
import type { CompanyDataRow, ManualEntry } from '@/types'

/** Charge toutes les données depuis Supabase et hydrate le store */
export function useCompanyData() {
  const { setRAW, setManualEntries, setBudData, setBudStatus, setDataLoading, setFilters } = useAppStore()

  const query = useQuery({
    queryKey: ['companyData'],
    queryFn: async () => {
      const [{ data: cd }, { data: bd }, { data: me }] = await Promise.all([
        sb.from('company_data').select('*'),
        sb.from('budget').select('*'),
        sb.from('manual_entries').select('*').order('entry_date', { ascending: true }),
      ])
      return {
        companyData: (cd ?? []) as CompanyDataRow[],
        budgets: (bd ?? []) as Array<{ company_key: string; data: Record<string, any>; status: string }>,
        manualEntries: (me ?? []) as ManualEntry[],
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  useEffect(() => {
    if (query.data) {
      const { companyData, budgets, manualEntries } = query.data
      const raw = buildRAW(companyData, budgets as any, manualEntries)
      setRAW(raw)
      setManualEntries(manualEntries)

      // Budget data
      const bd: Record<string, any> = {}
      const bs: Record<string, string> = {}
      for (const co of raw.keys) {
        const b = budgets.find(r => r.company_key === co)
        bd[co] = b?.data ?? {}
        bs[co] = b?.status ?? 'draft'
      }
      setBudData(bd)
      setBudStatus(bs)

      // Sélectionner toutes les sociétés par défaut
      setFilters({ selCo: raw.keys, budCo: raw.keys[0] ?? '' })
      setDataLoading(false)
    }
  }, [query.data])

  useEffect(() => {
    if (query.isLoading) setDataLoading(true)
  }, [query.isLoading])

  return query
}

/** Recharge les données (après une saisie manuelle par exemple) */
export function useRefreshData() {
  const { refetch } = useQuery({ queryKey: ['companyData'], enabled: false })
  return refetch
}
