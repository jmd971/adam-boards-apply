import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://fuxelqeizkmksapnetqz.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eGVscWVpemtta3NhcG5ldHF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg2MTUsImV4cCI6MjA5MDA0NDYxNX0.Hs6UWSkAxYwUZg-c7ykA2k5DmsvqUKYvwVGoteABi-Q'

export const sb            = createClient(SUPABASE_URL, SUPABASE_KEY)
export const OCR_PROXY_URL = `${SUPABASE_URL}/functions/v1/ocr-proxy`

interface RoleAndTenant {
  role: string
  tenantId: string | null
  tenantName: string | null
}

/**
 * Retourne le rôle et le tenant de l'utilisateur.
 * Lookup dans la table user_roles avec jointure sur tenants.
 */
export async function getUserRoleAndTenant(userId: string): Promise<RoleAndTenant> {
  try {
    const { data, error } = await sb
      .from('user_roles')
      .select('role, tenant_id, tenants(name)')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      const env = import.meta.env.VITE_ENV ?? 'test'
      return { role: env !== 'prod' ? 'admin' : 'viewer', tenantId: null, tenantName: null }
    }

    return {
      role: data.role ?? 'viewer',
      tenantId: data.tenant_id ?? null,
      tenantName: (data.tenants as any)?.name ?? null,
    }
  } catch {
    return { role: 'viewer', tenantId: null, tenantName: null }
  }
}
