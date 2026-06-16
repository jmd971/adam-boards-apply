/* eslint-disable @typescript-eslint/no-explicit-any */
const DUMMY_TENANT = '00000000-0000-0000-0000-000000000001'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const authHeader = req.headers['authorization'] ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return res.status(401).json({ error: 'Authentification requise.' })

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }

  // Valider le JWT via Supabase Auth (signature + expiration vérifiées côté serveur).
  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
  })
  if (!userResp.ok) return res.status(401).json({ error: 'JWT invalide ou expiré.' })
  const user = await userResp.json() as any
  const userId = user?.id
  if (typeof userId !== 'string') return res.status(401).json({ error: 'Utilisateur introuvable.' })

  const roleResp = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers },
  )
  const roleData = await roleResp.json() as any[]
  const isSuperadmin = Array.isArray(roleData) && roleData.some(r => r.role === 'superadmin')
  if (!isSuperadmin) return res.status(403).json({ error: 'Accès réservé aux superadmins.' })

  // L'ID du tenant DOIT être un UUID valide (empêche l'injection de filtres PostgREST).
  const tenantId = req.query?.id
  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    return res.status(400).json({ error: 'Identifiant de tenant invalide.' })
  }
  if (tenantId === DUMMY_TENANT) return res.status(403).json({ error: 'Ce tenant ne peut pas être supprimé.' })

  const id = encodeURIComponent(tenantId)
  const tables = ['company_data', 'budget', 'manual_entries', 'bank_accounts', 'company_objectives', 'company_settings', 'user_roles']
  for (const table of tables) {
    await fetch(`${supabaseUrl}/rest/v1/${table}?tenant_id=eq.${id}`, { method: 'DELETE', headers })
  }

  const delResp = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${id}`, { method: 'DELETE', headers })
  if (!delResp.ok && delResp.status !== 204) {
    const err = await delResp.text()
    return res.status(500).json({ error: `Erreur suppression tenant : ${err}` })
  }

  return res.status(200).json({ success: true })
}
