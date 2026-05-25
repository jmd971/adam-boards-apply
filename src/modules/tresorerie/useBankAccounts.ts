import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { useTenantId } from '@/store'

export interface BankAccount {
  id: string
  tenant_id: string
  company_key: string
  label: string
  balance: number
  balance_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

/** Fetch bank_accounts pour le tenant courant, indexés par company_key. */
export function useBankAccounts() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['bank_accounts', tenantId],
    enabled:  !!tenantId,
    queryFn: async () => {
      // Filtre tenant explicite obligatoire : la policy RLS autorise le superadmin à lire
      // TOUS les tenants (is_superadmin()). Sans ce .eq(), un superadmin récupérerait les
      // comptes bancaires de tous les groupes → prévisionnel faux (soldes mélangés).
      const { data, error } = await sb
        .from('bank_accounts')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('company_key', { ascending: true })
        .order('label',        { ascending: true })
      if (error) throw error
      const all = (data ?? []) as BankAccount[]
      const byCompany: Record<string, BankAccount[]> = {}
      const sumByCompany: Record<string, number> = {}
      for (const a of all) {
        if (!byCompany[a.company_key]) byCompany[a.company_key] = []
        byCompany[a.company_key].push(a)
        sumByCompany[a.company_key] = (sumByCompany[a.company_key] ?? 0) + Number(a.balance)
      }
      return { all, byCompany, sumByCompany }
    },
  })
}

export function useBankAccountMutations() {
  const tenantId = useTenantId()
  const qc       = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['bank_accounts'] })

  const create = async (input: Omit<BankAccount, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
    if (!tenantId) throw new Error('No tenant')
    const { error } = await sb.from('bank_accounts').insert({ tenant_id: tenantId, ...input })
    if (error) throw error
    invalidate()
  }

  const update = async (id: string, patch: Partial<Omit<BankAccount, 'id' | 'tenant_id'>>) => {
    const { error } = await sb.from('bank_accounts').update(patch).eq('id', id)
    if (error) throw error
    invalidate()
  }

  const remove = async (id: string) => {
    const { error } = await sb.from('bank_accounts').delete().eq('id', id)
    if (error) throw error
    invalidate()
  }

  return { create, update, remove }
}
