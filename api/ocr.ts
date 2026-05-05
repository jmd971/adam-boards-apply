/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY non configurée. Ajoutez-la dans Vercel → Settings → Environment Variables.'
    })
  }

  // Transmettre le corps de la requête directement à l'API Anthropic
  // avec le bon modèle
  const body = req.body ?? {}
  if (body.model && (body.model === 'claude-opus-4-5' || body.model === 'claude-opus-4-6')) {
    body.model = 'claude-sonnet-4-6'
  }
  if (!body.model) {
    body.model = 'claude-sonnet-4-6'
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await resp.json()
  return res.status(resp.status).json(data)
}
