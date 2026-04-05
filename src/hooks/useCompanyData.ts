import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { sb } from '@/lib/supabase'
import { buildRAW } from '@/lib/calc'
import { useAppStore } from '@/store'
import type { CompanyDataRow, ManualEntry } from '@/types'

export function useCompanyData() {
  const user            = useAppStore(s => s.user)
  const setRAW          = useAppStore(s => s.setRAW)
  const setManualEntries = useAppStore(s => s.setManualEntries)
  const setBudData      = useAppStore(s => s.setBudData)
  const setBudStatus    = useAppStore(s => s.setBudStatus)
  const setDataLoading  = useAppStore(s => s.setDataLoading)
  const setFilters      = useAppStore(s => s.setFilters)

  const query = useQuery({
    // Inclure l'user ID dans la clé → refetch automatique après login
    queryKey: ['companyData', user?.id ?? 'anonymous'],
    enabled:  !!user,   // ne pas lancer sans utilisateur connecté
    queryFn: async () => {
      const [cdRes, bdRes, meRes] = await Promise.all([
        sb.from('company_data').select('*'),
        sb.from('budget').select('*'),
        sb.from('manual_entries').select('*').order('entry_date', { ascending: true }),
      ])

      if (cdRes.error) console.error('[Supabase] company_data:', cdRes.error.message)
      if (bdRes.error) console.error('[Supabase] budget:', bdRes.error.message)
      if (meRes.error) console.error('[Supabase] manual_entries:', meRes.error.message)

      return {
        companyData:   (cdRes.data ?? []) as CompanyDataRow[],
        budgets:       (bdRes.data ?? []) as Array<{ company_key: string; data: Record<string, any>; status: string }>,
        manualEntries: (meRes.data ?? []) as ManualEntry[],
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  useEffect(() => {
    // Si pas d'user : ne pas toucher à dataLoading (reste true jusqu'au login)
    if (!user) return

    if (query.isLoading || query.isFetching) {
      setDataLoading(true)
      return
    }

    const { companyData = [], budgets = [], manualEntries = [] } = query.data ?? {}
    const raw = buildRAW(companyData, budgets as any, manualEntries)
    setRAW(raw)
    setManualEntries(manualEntries)

    const bd: Record<string, any> = {}
    const bs: Record<string, string> = {}
    for (const co of raw.keys) {
      const b = budgets.find(r => r.company_key === co)
      bd[co] = b?.data ?? {}
      bs[co] = b?.status ?? 'draft'
    }
    setBudData(bd)
    setBudStatus(bs)

    if (raw.keys.length > 0) {
      setFilters({ selCo: raw.keys, budCo: raw.keys[0] ?? '' })
    }
    if (raw.mn.length > 0) {
      setFilters({ startM: raw.mn[0], endM: raw.mn[raw.mn.length - 1] })
    }

    setDataLoading(false)
  }, [user?.id, query.isLoading, query.isFetching, query.data])

  return query
}
