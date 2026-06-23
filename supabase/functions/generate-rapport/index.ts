import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: corsHeaders })

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: corsHeaders })

    const body = await req.json() as {
      rapportData: Record<string, unknown>
      tenantId: string
      companyKey: string
    }

    const { rapportData, tenantId, companyKey } = body
    if (!rapportData || !tenantId || !companyKey) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: corsHeaders })
    }

    // Vérifier que l'utilisateur a accès à ce tenant
    // Récupère tous les rôles de l'utilisateur. Un superadmin n'est pas rattaché
    // au tenant consulté (il en choisit un via le dashboard) → on l'autorise
    // globalement. Les autres rôles doivent matcher le tenant demandé.
    const { data: roles } = await sb
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const isSuperadmin = (roles ?? []).some(r => r.role === 'superadmin')
    const hasTenantRole = (roles ?? []).some(
      r => r.tenant_id === tenantId && ['admin', 'comptable'].includes(r.role)
    )

    if (!isSuperadmin && !hasTenantRole) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: corsHeaders })
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const systemPrompt = `Tu es un expert-comptable qui rédige des rapports d'activité pour des dirigeants d'entreprise.
Ton rôle : analyser des données financières structurées et les traduire en observations claires, en français, sans jargon comptable.
Règles absolues :
- Jamais de termes comme "DSO", "z-score", "outlier", "écart-type", "indice de récurrence"
- Parle comme si tu expliquais à un ami dirigeant : direct, concret, avec des chiffres arrondis
- Chaque phrase doit mener à une observation utile ou une recommandation courte
- Sois positif sur les points forts, précis sur les risques, sans alarmisme excessif
- Format de réponse : JSON strict avec les clés demandées, aucun texte en dehors du JSON`

    const userPrompt = `Voici les données d'activité d'une entreprise sur les 12 derniers mois. Analyse-les et rédige le rapport.

DONNÉES :
${JSON.stringify(rapportData, null, 2)}

Réponds UNIQUEMENT avec ce JSON (toutes les clés sont obligatoires) :
{
  "synthese": "2-3 phrases résumant l'état général de l'entreprise, ses points forts et ses principaux risques",
  "modele_eco": "1-2 phrases décrivant comment l'entreprise fonctionne (récurrent/ponctuel, services/produits, base client)",
  "saisonnalite": "1-2 phrases sur les mois de pic et de creux détectés, ou null si pas de saisonnalité marquée",
  "operations": "2-3 phrases sur le volume et la nature des opérations, les tendances, les ruptures détectées",
  "tiers": "2-3 phrases sur les clients et fournisseurs clés, la concentration, les nouveaux entrants",
  "paiements": "2-3 phrases sur les délais d'encaissement et de règlement, les retards, les modes inhabituels",
  "points_forts": ["point fort 1", "point fort 2"],
  "alertes": ["alerte 1 en langage clair", "alerte 2 en langage clair"],
  "recommandations": ["recommandation courte 1", "recommandation courte 2"]
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Réponse inattendue de Claude')

    let rapportJson: Record<string, unknown>
    try {
      const cleaned = content.text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
      rapportJson = JSON.parse(cleaned)
    } catch {
      throw new Error('Impossible de parser la réponse Claude')
    }

    // Sauvegarder en base avec le client service_role pour bypasser RLS en écriture
    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: saved, error: saveError } = await sbAdmin.from('rapports').insert({
      tenant_id: tenantId,
      company_key: companyKey,
      period_start: (rapportData as any).periodStart,
      period_end: (rapportData as any).periodEnd,
      data_json: rapportData,
      rapport_json: rapportJson,
    }).select('id').single()

    if (saveError) console.error('[rapports] save error:', saveError.message)

    return new Response(
      JSON.stringify({ rapportJson, rapportId: saved?.id ?? null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[generate-rapport]', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
