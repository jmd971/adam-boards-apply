import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { useTenantId } from '@/store'
import type { ManualEntry } from '@/types'
import type { FieldKey } from '@/modules/saisie/CsvImportView'

/** Mapping d'import CSV enregistré : correspondance champ → en-tête (normalisé). */
export interface CsvMapping {
  id: string
  tenant_id: string
  company_key: string
  category: ManualEntry['category']
  name: string
  mapping: Partial<Record<FieldKey, string>>
  created_at: string
  updated_at: string
}

/**
 * Mappings d'import CSV réutilisables du tenant.
 * Renvoie la liste brute + un regroupement par company_key pour lookup direct.
 */
export function useCsvMappings() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['csv_import_mappings', tenantId],
    enabled:  !!tenantId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('csv_import_mappings')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      const all = (data ?? []) as CsvMapping[]
      const byCompany: Record<string, CsvMapping[]> = {}
      for (const m of all) (byCompany[m.company_key] ??= []).push(m)
      return { all, byCompany }
    },
  })
}

export function useCsvMappingMutations() {
  const tenantId = useTenantId()
  const qc       = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['csv_import_mappings'] })

  /** Upsert sur la clé (tenant_id, company_key, category, name). */
  const save = async (input: {
    company_key: string
    category: ManualEntry['category']
    name: string
    mapping: Partial<Record<FieldKey, string>>
  }) => {
    if (!tenantId) throw new Error('No tenant')
    const { error } = await sb
      .from('csv_import_mappings')
      .upsert(
        { tenant_id: tenantId, ...input },
        { onConflict: 'tenant_id,company_key,category,name' }
      )
    if (error) throw error
    invalidate()
  }

  const remove = async (id: string) => {
    if (!tenantId) throw new Error('No tenant')
    const { error } = await sb
      .from('csv_import_mappings')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id)
    if (error) throw error
    invalidate()
  }

  return { save, remove }
}
