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

    const systemPrompt = `Tu es un expert-comptable qui rédige un rapport d'activité ACTIONNABLE pour un dirigeant d'entreprise.
Tu compares l'exercice N à N-1 et au budget. Ton objectif : que le dirigeant sache exactement QUELLE ACTION mener, et AVEC QUEL CLIENT, FOURNISSEUR ou SUR QUEL POSTE.

Règles absolues :
- NOMME toujours les clients, fournisseurs et postes concernés (utilise les noms fournis dans les données). Jamais d'analyse anonyme.
- Pas de jargon : pas de "DSO", "z-score", "écart-type". Parle clair, avec des chiffres arrondis en euros et en jours.
- Pour les DÉLAIS : explique comment CHAQUE client/fournisseur tire la moyenne globale. Ex : "Le client X paie à 80 jours et pèse 40% de vos ventes : c'est lui qui dégrade votre délai moyen, à relancer en priorité."
- Pour les CHARGES et PRODUITS : commente la fréquence, le montant moyen, le poids dans le total, et l'évolution vs N-1 et budget. Signale les postes qui dérapent.
- Pour les IMMOBILISATIONS : commente leur poids et l'impact sur les amortissements (dotations).
- Chaque action doit être concrète et nominative.
- Réponds en JSON strict, aucun texte hors du JSON.`

    const userPrompt = `Données de l'exercice (cumul N vs N-1 vs budget). Tous les montants sont en euros, les délais en jours.

${JSON.stringify(rapportData, null, 2)}

Réponds UNIQUEMENT avec ce JSON (toutes les clés obligatoires) :
{
  "synthese": "3-4 phrases : résultat N vs N-1, tendance générale, 1-2 risques majeurs nommés",
  "produits": "Analyse des produits : postes clés nommés, évolution vs N-1 et budget, fréquence/montant moyen des plus significatifs",
  "charges": "Analyse des charges : postes qui pèsent le plus, ceux qui dérapent vs N-1/budget (nommés), fréquence et montant moyen",
  "immobilisations": "Analyse des immobilisations et de leur impact sur les amortissements, ou null si aucune",
  "clients_analyse": "Analyse des délais clients : comment chaque gros client (nommé) impacte le délai moyen global",
  "fournisseurs_analyse": "Analyse des délais fournisseurs : comment chaque fournisseur (nommé) impacte le délai moyen global",
  "actions_clients": [{"client": "nom", "constat": "ex: paie à 75j, 30% du CA", "action": "ex: négocier un acompte / relancer"}],
  "actions_fournisseurs": [{"fournisseur": "nom", "constat": "...", "action": "..."}],
  "actions_postes": [{"poste": "nom du compte/charge", "constat": "ex: +45% vs budget", "action": "..."}],
  "points_forts": ["..."],
  "alertes": ["..."]
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
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

    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: saved, error: saveError } = await sbAdmin.from('rapports').insert({
      tenant_id: tenantId,
      company_key: companyKey,
      period_start: `${(rapportData as any).exerciceN}-01-01`,
      period_end: `${(rapportData as any).exerciceN}-12-31`,
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
