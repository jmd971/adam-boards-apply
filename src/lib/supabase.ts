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
 * Normalise un rôle brut de la DB : casse, espaces, underscores/tirets.
 * Exemples : "Super_Admin" → "superadmin", "SUPER-ADMIN" → "superadmin".
 */
function normalizeRole(raw: string | null | undefined): string {
  if (!raw) return 'viewer'
  return raw.toLowerCase().trim().replace(/[_\s-]+/g, '')
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
      role: normalizeRole(data.role),
      tenantId: data.tenant_id ?? null,
      tenantName: (data.tenants as any)?.name ?? null,
    }
  } catch {
    return { role: 'viewer', tenantId: null, tenantName: null }
  }
}
