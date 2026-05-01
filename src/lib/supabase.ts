import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const sb            = createClient(supabaseUrl, supabaseAnonKey)
export const OCR_PROXY_URL = `${supabaseUrl}/functions/v1/ocr-proxy`

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
