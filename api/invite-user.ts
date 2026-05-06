/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY non configurée dans Vercel → Settings → Environment Variables.'
    })
  }

  const { email, password, company_name, tenant_id, role = 'viewer' } = req.body ?? {}
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email requis.' })

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
  }

  // ── 1. Créer le compte auth ───────────────────────────────────────────────
  const payload: any = { email: email.trim() }
  if (password && typeof password === 'string') {
    payload.password = password
    payload.email_confirm = true
  } else {
    payload.invite = true
  }

  const authResp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const authData = await authResp.json() as any
  if (!authResp.ok) {
    return res.status(authResp.status).json({ error: authData.msg ?? authData.message ?? 'Erreur création compte.' })
  }
  const userId: string = authData.id

  // ── 2a. Invitation à un tenant existant ───────────────────────────────────
  if (tenant_id) {
    const roleResp = await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ user_id: userId, tenant_id, role }),
    })
    if (!roleResp.ok) {
      const err = await roleResp.json().catch(() => ({}))
      console.error('[invite-user] role creation failed:', err)
    }
    return res.status(200).json({ user_id: userId, email: authData.email, tenant_id })
  }

  // ── 2b. Nouvelle inscription : créer tenant + rôle admin ─────────────────
  const name = (company_name as string | undefined)?.trim() || email.split('@')[0]
  const baseSlug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30) || 'company'
  const slug = `${baseSlug}_${Date.now().toString(36)}`

  const tenantResp = await fetch(`${supabaseUrl}/rest/v1/tenants`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({ name, slug }),
  })
  const tenantData = await tenantResp.json() as any
  if (!tenantResp.ok) {
    return res.status(500).json({ error: 'Erreur création tenant : ' + JSON.stringify(tenantData) })
  }
  const newTenantId: string = (Array.isArray(tenantData) ? tenantData[0] : tenantData)?.id
  if (!newTenantId) {
    return res.status(500).json({ error: 'Tenant créé mais id manquant.' })
  }

  const roleResp2 = await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: userId, tenant_id: newTenantId, role: 'admin' }),
  })
  if (!roleResp2.ok) {
    const err = await roleResp2.json().catch(() => ({}))
    console.error('[invite-user] admin role creation failed:', err)
  }

  return res.status(200).json({ user_id: userId, email: authData.email, tenant_id: newTenantId })
}
