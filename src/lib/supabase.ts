import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://fuxelqeizkmksapnetqz.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eGVscWVpemtta3NhcG5ldHF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg2MTUsImV4cCI6MjA5MDA0NDYxNX0.Hs6UWSkAxYwUZg-c7ykA2k5DmsvqUKYvwVGoteABi-Q'

export const sb            = createClient(SUPABASE_URL, SUPABASE_KEY)
export const OCR_PROXY_URL = `${SUPABASE_URL}/functions/v1/ocr-proxy`

/**
 * Retourne le rôle de l'utilisateur.
 * En mode test (VITE_ENV !== 'prod') → toujours 'admin'.
 * En prod, lookup dans la table user_roles.
 */
export async function getUserRole(userId: string): Promise<string> {
  const env = import.meta.env.VITE_ENV ?? 'test'
  if (env !== 'prod') return 'admin'

  try {
    const { data, error } = await sb
      .from('user_roles').select('role').eq('user_id', userId).single()
    if (error) return 'viewer'
    return data?.role ?? 'viewer'
  } catch {
    return 'viewer'
  }
}
