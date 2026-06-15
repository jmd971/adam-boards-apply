import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { useTenantId } from '@/store'

export interface CompanyObjective {
  id: string
  tenant_id: string
  company_key: string
  target_margin_rate: number | null   // % (0-100)
  target_margin_amount: number | null // € absolu
  billable_hours: number | null       // heures facturables / an (solopreneurs, prestataires)
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Objectifs de marge par société (taux % + montant €).
 * Indexés par company_key pour lookup direct.
 */
export function useCompanyObjectives() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['company_objectives', tenantId],
    enabled:  !!tenantId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('company_objectives')
        .select('*')
        .order('company_key', { ascending: true })
      if (error) throw error
      const all = (data ?? []) as CompanyObjective[]
      const byCompany: Record<string, CompanyObjective> = {}
      for (const o of all) byCompany[o.company_key] = o
      return { all, byCompany }
    },
  })
}

export function useCompanyObjectiveMutations() {
  const tenantId = useTenantId()
  const qc       = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['company_objectives'] })

  /** Upsert (insert ou update) sur la clé (tenant_id, company_key). */
  const upsert = async (
    company_key: string,
    patch: { target_margin_rate?: number | null; target_margin_amount?: number | null; billable_hours?: number | null; notes?: string | null }
  ) => {
    if (!tenantId) throw new Error('No tenant')
    const { error } = await sb
      .from('company_objectives')
      .upsert(
        { tenant_id: tenantId, company_key, ...patch },
        { onConflict: 'tenant_id,company_key' }
      )
    if (error) throw error
    invalidate()
  }

  const remove = async (company_key: string) => {
    if (!tenantId) throw new Error('No tenant')
    const { error } = await sb
      .from('company_objectives')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('company_key', company_key)
    if (error) throw error
    invalidate()
  }

  return { upsert, remove }
}
