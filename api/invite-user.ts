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

  const { email, password } = req.body ?? {}
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Email requis.' })

  const payload: any = { email: email.trim() }

  if (password && typeof password === 'string') {
    // Création directe avec mot de passe — email déjà confirmé, pas d'email envoyé
    payload.password = password
    payload.email_confirm = true
  } else {
    // Invitation classique (email d'invitation envoyé)
    payload.invite = true
  }

  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
    body: JSON.stringify(payload),
  })

  const data = await resp.json() as any
  if (!resp.ok) {
    return res.status(resp.status).json({ error: data.msg ?? data.message ?? 'Erreur Supabase' })
  }

  return res.status(200).json({ user_id: data.id, email: data.email })
}
