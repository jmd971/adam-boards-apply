import { createClient } from '@supabase/supabase-js'

const ENV = import.meta.env.VITE_ENV ?? 'prod'

const PROD_URL = 'https://mxupchugihoedsdlalbx.supabase.co'
const PROD_KEY = 'sb_publishable_4cpeu8Xnm2hb5iGv5eFCdg_1rla1iKs'
const TEST_URL = 'https://fuxelqeizkmksapnetqz.supabase.co'
const TEST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eGVscWVpemtta3NhcG5ldHF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg2MTUsImV4cCI6MjA5MDA0NDYxNX0.Hs6UWSkAxYwUZg-c7ykA2k5DmsvqUKYvwVGoteABi-Q'

export const SUPABASE_URL = ENV === 'prod'
  ? (import.meta.env.VITE_SUPABASE_URL ?? PROD_URL)
  : TEST_URL

const SUPABASE_KEY = ENV === 'prod'
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY ?? PROD_KEY)
  : TEST_KEY

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

export const OCR_PROXY_URL = `${SUPABASE_URL}/functions/v1/ocr-proxy`

/** Récupère le rôle de l'utilisateur connecté */
export async function getUserRole(userId: string): Promise<string> {
  const { data } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single()
  return data?.role ?? 'viewer'
}
