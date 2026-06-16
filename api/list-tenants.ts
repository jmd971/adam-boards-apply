/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireSuperadmin, DUMMY_TENANT } from './_auth'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configurée.' })
  }

  const auth = await requireSuperadmin(req, supabaseUrl, serviceKey)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }

  // Récupérer tous les tenants (sauf Cabinet par défaut)
  const tenantsResp = await fetch(
    `${supabaseUrl}/rest/v1/tenants?id=neq.${DUMMY_TENANT}&select=id,name,slug,created_at&order=name.asc`,
    { headers },
  )
  const tenants = await tenantsResp.json() as any[]

  // Pour chaque tenant, compter les membres
  const tenantsWithCount = await Promise.all(
    (tenants ?? []).map(async (t: any) => {
      const countResp = await fetch(
        `${supabaseUrl}/rest/v1/user_roles?tenant_id=eq.${encodeURIComponent(t.id)}&select=user_id`,
        { headers: { ...headers, Prefer: 'count=exact' } },
      )
      const countHeader = countResp.headers.get('content-range')
      const memberCount = countHeader ? parseInt(countHeader.split('/')[1] ?? '0') : 0
      return { ...t, memberCount }
    }),
  )

  return res.status(200).json(tenantsWithCount)
}
