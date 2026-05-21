import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { sb } from '@/lib/supabase'
import { buildRAW } from '@/lib/calc'
import { useAppStore } from '@/store'
import type { CompanyDataRow, ManualEntry } from '@/types'

export function useCompanyData() {
  const user            = useAppStore(s => s.user)
  const tenantId        = useAppStore(s => s.tenantId)
  const setRAW          = useAppStore(s => s.setRAW)
  const setManualEntries = useAppStore(s => s.setManualEntries)
  const setBudData      = useAppStore(s => s.setBudData)
  const setBudStatus    = useAppStore(s => s.setBudStatus)
  const setBudVersions  = useAppStore(s => s.setBudVersions)
  const setFiscalSettings = useAppStore(s => s.setFiscalSettings)
  const setDataLoading  = useAppStore(s => s.setDataLoading)
  const setFilters      = useAppStore(s => s.setFilters)

  const query = useQuery({
    // Inclure l'user ID dans la clé → refetch automatique après login
    queryKey: ['companyData', user?.id ?? 'anonymous', tenantId],
    enabled:  !!user && !!tenantId,
    queryFn: async () => {
      // Filtre tenant explicite : la policy RLS autorise le superadmin à lire
      // tous les tenants (is_superadmin()), il faut cibler côté client sinon
      // un switch de tenant renverrait l'union des deux.
      const [cdRes, bdRes, meRes, csRes] = await Promise.all([
        sb.from('company_data').select('*').eq('tenant_id', tenantId!),
        sb.from('budget').select('*').eq('tenant_id', tenantId!),
        sb.from('manual_entries').select('*').eq('tenant_id', tenantId!).order('entry_date', { ascending: true }),
        sb.from('company_settings').select('company_key, fiscal_year_start_month').eq('tenant_id', tenantId!),
      ])

      if (cdRes.error) console.error('[Supabase] company_data:', cdRes.error.message)
      if (bdRes.error) console.error('[Supabase] budget:', bdRes.error.message)
      if (meRes.error) console.error('[Supabase] manual_entries:', meRes.error.message)
      if (csRes.error) console.error('[Supabase] company_settings:', csRes.error.message)

      const fiscalSettings: Record<string, number> = {}
      for (const r of (csRes.data ?? []) as Array<{ company_key: string; fiscal_year_start_month: number }>) {
        fiscalSettings[r.company_key] = r.fiscal_year_start_month
      }

      return {
        companyData:   (cdRes.data ?? []) as CompanyDataRow[],
        budgets:       (bdRes.data ?? []) as Array<{ id: string; company_key: string; version_name: string; data: Record<string, any>; status: string }>,
        manualEntries: (meRes.data ?? []) as ManualEntry[],
        fiscalSettings,
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

    const { companyData = [], budgets = [], manualEntries = [], fiscalSettings = {} } = query.data ?? {}
    const raw = buildRAW(companyData, budgets as any, manualEntries, fiscalSettings)
    setRAW(raw)
    setManualEntries(manualEntries)
    setFiscalSettings(fiscalSettings)

    const bd: Record<string, any> = {}
    const bs: Record<string, string> = {}
    for (const co of raw.keys) {
      const versions = budgets.filter(r => r.company_key === co)
      const b = versions[0]
      bd[co] = b?.data ?? {}
      bs[co] = b?.status ?? 'draft'
    }
    setBudData(bd)
    setBudStatus(bs)
    setBudVersions(budgets.map(b => ({
      id: b.id,
      company_key: b.company_key,
      version_name: b.version_name ?? 'Budget principal',
      data: b.data ?? {},
      status: (b.status ?? 'draft') as 'draft' | 'validated',
    })))

    if (raw.keys.length > 0) {
      setFilters({ selCo: raw.keys, budCo: raw.keys[0] ?? '' })
    }

    // Période par défaut = exercice courant N (RAW.mn), avec fallback N-1 puis N-2 si pas de N.
    // On PRÉSERVE une période déjà choisie par l'utilisateur uniquement si elle reste DANS cet
    // exercice par défaut — sinon chaque refresh la réinitialisait (changements perdus). Mais on
    // ne la préserve PAS si elle pointe hors de l'exercice courant (ex : période obsolète après
    // un ré-import, ou pointant sur du N-1) : sinon le Dashboard, centré sur N, perdrait sa
    // comparaison N-1 faute de mois N dans la sélection.
    const defaultSet = raw.mn.length ? raw.mn : raw.m1.length ? raw.m1 : raw.m2.length ? raw.m2 : []
    const { startM, endM } = useAppStore.getState().filters
    const periodStillValid =
      !!startM && !!endM && defaultSet.includes(startM) && defaultSet.includes(endM)

    if (!periodStillValid && defaultSet.length > 0) {
      setFilters({ startM: defaultSet[0], endM: defaultSet[defaultSet.length - 1] })
    }

    setDataLoading(false)
  }, [user?.id, query.isLoading, query.isFetching, query.data])

  return query
}
