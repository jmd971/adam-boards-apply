/* eslint-disable @typescript-eslint/no-explicit-any */
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

  // Vérifier que l'appelant est superadmin via son JWT
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return res.status(401).json({ error: 'Authentification requise.' })

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
  }

  // Décoder le JWT pour obtenir le user_id (sans vérif de signature côté API route)
  let userId: string | null = null
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString())
    userId = payload.sub
  } catch {
    return res.status(401).json({ error: 'JWT invalide.' })
  }
  if (!userId) return res.status(401).json({ error: 'User ID introuvable dans le JWT.' })

  // Vérifier le rôle superadmin dans la DB
  const roleResp = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    { headers }
  )
  const roleData = await roleResp.json() as any[]
  const isSuperadmin = roleData?.some((r: any) => r.role === 'superadmin')
  if (!isSuperadmin) return res.status(403).json({ error: 'Accès réservé aux superadmins.' })

  // Récupérer tous les tenants (sauf Cabinet par défaut)
  const DUMMY_TENANT = '00000000-0000-0000-0000-000000000001'
  const tenantsResp = await fetch(
    `${supabaseUrl}/rest/v1/tenants?id=neq.${DUMMY_TENANT}&select=id,name,slug,created_at&order=name.asc`,
    { headers }
  )
  const tenants = await tenantsResp.json() as any[]

  // Pour chaque tenant, compter les membres
  const tenantsWithCount = await Promise.all(
    (tenants ?? []).map(async (t: any) => {
      const countResp = await fetch(
        `${supabaseUrl}/rest/v1/user_roles?tenant_id=eq.${t.id}&select=user_id`,
        { headers: { ...headers, 'Prefer': 'count=exact' } }
      )
      const countHeader = countResp.headers.get('content-range')
      const memberCount = countHeader ? parseInt(countHeader.split('/')[1] ?? '0') : 0
      return { ...t, memberCount }
    })
  )

  return res.status(200).json(tenantsWithCount)
}
