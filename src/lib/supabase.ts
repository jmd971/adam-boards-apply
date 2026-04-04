import { createClient } from '@supabase/supabase-js'

const TEST_URL = 'https://fuxelqeizkmksapnetqz.supabase.co'
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eGVscWVpemtta3NhcG5ldHF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg2MTUsImV4cCI6MjA5MDA0NDYxNX0.Hs6UWSkAxYwUZg-c7ykA2k5DmsvqUKYvwVGoteABi-Q'

export const SUPABASE_URL = TEST_URL
const SUPABASE_KEY = TEST_KEY

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
export const OCR_PROXY_URL = `${SUPABASE_URL}/functions/v1/ocr-proxy`

/** Récupère le rôle — retourne 'admin' si la table n'existe pas (base TEST) */
export async function getUserRole(_userId: string): Promise<string> {
  try {
    const { data, error } = await sb
      .from('user_roles')
      .select('role')
      .eq('user_id', _userId)
      .single()
    if (error) return 'admin'  // table absente ou pas de ligne → admin par défaut
    return data?.role ?? 'admin'
  } catch {
    return 'admin'
  }
}
