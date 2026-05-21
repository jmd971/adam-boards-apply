import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { useTenantId } from '@/store'

export interface CompanySetting {
  id: string
  tenant_id: string
  company_key: string
  fiscal_year_start_month: number   // 1-12 (1 = janvier = année civile)
  created_at: string
  updated_at: string
}

/**
 * Réglages par société (mois de début d'exercice fiscal, etc.).
 * Indexés par company_key. Renvoie aussi une map company_key → startMonth
 * directement consommable par buildRAW (defaut 1 si non défini).
 */
export function useCompanySettings() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['company_settings', tenantId],
    enabled:  !!tenantId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('company_settings')
        .select('*')
        .order('company_key', { ascending: true })
      if (error) throw error
      const all = (data ?? []) as CompanySetting[]
      const byCompany: Record<string, CompanySetting> = {}
      const startMonthByCompany: Record<string, number> = {}
      for (const s of all) {
        byCompany[s.company_key] = s
        startMonthByCompany[s.company_key] = s.fiscal_year_start_month
      }
      return { all, byCompany, startMonthByCompany }
    },
  })
}

export function useCompanySettingMutations() {
  const tenantId = useTenantId()
  const qc       = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['company_settings'] })

  /** Upsert sur (tenant_id, company_key). */
  const setFiscalYearStartMonth = async (company_key: string, fiscal_year_start_month: number) => {
    if (!tenantId) throw new Error('No tenant')
    if (fiscal_year_start_month < 1 || fiscal_year_start_month > 12) throw new Error('Mois invalide (1-12)')
    const { error } = await sb
      .from('company_settings')
      .upsert(
        { tenant_id: tenantId, company_key, fiscal_year_start_month },
        { onConflict: 'tenant_id,company_key' }
      )
    if (error) throw error
    invalidate()
  }

  return { setFiscalYearStartMonth }
}
