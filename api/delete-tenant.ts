/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configurée.' })
  }

  // Vérifier JWT
  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return res.status(401).json({ error: 'Authentification requise.' })

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
  }

  // Décoder le JWT
  let userId: string | null = null
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString())
    userId = payload.sub
  } catch {
    return res.status(401).json({ error: 'JWT invalide.' })
  }
  if (!userId) return res.status(401).json({ error: 'User ID introuvable dans le JWT.' })

  // Vérifier superadmin
  const roleResp = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    { headers }
  )
  const roleData = await roleResp.json() as any[]
  const isSuperadmin = roleData?.some((r: any) => r.role === 'superadmin')
  if (!isSuperadmin) return res.status(403).json({ error: 'Accès réservé aux superadmins.' })

  // Récupérer l'ID du tenant à supprimer
  const tenantId = typeof req.query?.id === 'string' ? req.query.id : null
  if (!tenantId) return res.status(400).json({ error: 'id manquant.' })

  // Protéger le tenant système
  const DUMMY_TENANT = '00000000-0000-0000-0000-000000000001'
  if (tenantId === DUMMY_TENANT) return res.status(403).json({ error: 'Ce tenant ne peut pas être supprimé.' })

  // Supprimer les données liées puis le tenant
  const tables = ['company_data', 'budget', 'manual_entries', 'bank_accounts', 'user_roles']
  for (const table of tables) {
    await fetch(`${supabaseUrl}/rest/v1/${table}?tenant_id=eq.${tenantId}`, {
      method: 'DELETE', headers,
    })
  }

  const delResp = await fetch(
    `${supabaseUrl}/rest/v1/tenants?id=eq.${tenantId}`,
    { method: 'DELETE', headers }
  )

  if (!delResp.ok && delResp.status !== 204) {
    const err = await delResp.text()
    return res.status(500).json({ error: `Erreur suppression tenant : ${err}` })
  }

  return res.status(200).json({ success: true })
}
