/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireSuperadmin, isUuid, DUMMY_TENANT } from './_auth'

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

  const auth = await requireSuperadmin(req, supabaseUrl, serviceKey)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  // L'ID du tenant DOIT être un UUID valide — empêche l'injection de filtres
  // PostgREST (ex : "uuid&tenant_id=neq.x" élargirait la suppression).
  const tenantId = req.query?.id
  if (!isUuid(tenantId)) return res.status(400).json({ error: 'Identifiant de tenant invalide.' })
  if (tenantId === DUMMY_TENANT) return res.status(403).json({ error: 'Ce tenant ne peut pas être supprimé.' })

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }
  const id = encodeURIComponent(tenantId)

  // Supprimer les données liées puis le tenant
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
