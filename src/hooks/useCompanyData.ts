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
  const setVatSettings  = useAppStore(s => s.setVatSettings)
  const setForecastSettings = useAppStore(s => s.setForecastSettings)
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
        // select('*') : résilient si la migration 012 (vat_enabled/vat_rates) n'est pas
        // encore jouée — les colonnes absentes sont simplement undefined (pas d'erreur).
        sb.from('company_settings').select('*').eq('tenant_id', tenantId!),
      ])

      if (cdRes.error) console.error('[Supabase] company_data:', cdRes.error.message)
      if (bdRes.error) console.error('[Supabase] budget:', bdRes.error.message)
      if (meRes.error) console.error('[Supabase] manual_entries:', meRes.error.message)
      if (csRes.error) console.error('[Supabase] company_settings:', csRes.error.message)

      const fiscalSettings: Record<string, number> = {}
      const vatSettings: Record<string, { enabled: boolean; rates: Record<string, number> }> = {}
      const forecastSettings: Record<string, { delaiClient: number; delaiFourn: number; remb: number; soldeInitial: number }> = {}
      for (const r of (csRes.data ?? []) as Array<{ company_key: string; fiscal_year_start_month: number; vat_enabled?: boolean; vat_rates?: Record<string, number> | null }>) {
        fiscalSettings[r.company_key] = r.fiscal_year_start_month
        vatSettings[r.company_key] = { enabled: !!r.vat_enabled, rates: r.vat_rates ?? {} }
        const fp = (r.forecast_params ?? {}) as any
        if (fp && Object.keys(fp).length > 0) {
          forecastSettings[r.company_key] = {
            delaiClient:  Number(fp.delaiClient)  || 0,
            delaiFourn:   Number(fp.delaiFourn)   || 0,
            remb:         Number(fp.remb)         || 0,
            soldeInitial: Number(fp.soldeInitial) || 0,
          }
        }
      }

      return {
        companyData:   (cdRes.data ?? []) as CompanyDataRow[],
        budgets:       (bdRes.data ?? []) as Array<{ id: string; company_key: string; version_name: string; data: Record<string, any>; status: string }>,
        manualEntries: (meRes.data ?? []) as ManualEntry[],
        fiscalSettings,
        vatSettings,
        forecastSettings,
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

    const { companyData = [], budgets = [], manualEntries = [], fiscalSettings = {}, vatSettings = {}, forecastSettings = {} } = query.data ?? {}
    const raw = buildRAW(companyData, budgets as any, manualEntries, fiscalSettings)
    setRAW(raw)
    setManualEntries(manualEntries)
    setFiscalSettings(fiscalSettings)
    setVatSettings(vatSettings)
    setForecastSettings(forecastSettings)

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
    } else {
      // Compte/tenant sans aucune donnée (ni FEC ni saisie) : purger les sociétés
      // persistées en localStorage par une session précédente — sinon le nom d'une
      // société d'un AUTRE compte resterait affiché en tête du Dashboard.
      setFilters({ selCo: [], budCo: '' })
    }

    // Période = exercice courant N (RAW.mn), fallback N-1 puis N-2 si pas de N.
    // RÉINITIALISATION DÉTERMINISTE à chaque chargement : la période ne dépend QUE des données
    // (le même tenant donne la même plage pour tous les utilisateurs). On ne préserve PAS la
    // période persistée par navigateur — sinon deux superadmins sur le même tenant verraient
    // des plages de mois différentes (donc des chiffres trésorerie/analyse différents).
    // (L'ancienne plainte « la période revenait sur janvier » venait d'un exercice mal réglé :
    //  avec l'exercice fiscal correct, RAW.mn couvre tout l'exercice, pas un seul mois.)
    const defaultSet = raw.mn.length ? raw.mn : raw.m1.length ? raw.m1 : raw.m2.length ? raw.m2 : []
    if (defaultSet.length > 0) {
      setFilters({ startM: defaultSet[0], endM: defaultSet[defaultSet.length - 1] })
    } else {
      // Aucune donnée : purger aussi la période persistée (sinon « Jan 26 → Avr 26 »
      // d'une session précédente reste affiché dans la barre du haut).
      setFilters({ startM: '', endM: '' })
    }

    setDataLoading(false)
  }, [user?.id, query.isLoading, query.isFetching, query.data])

  return query
}
