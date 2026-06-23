import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Schéma de sortie structurée — garantit un JSON valide (pas de parsing fragile)
const RAPPORT_TOOL = {
  name: 'rapport_activite',
  description: "Enregistre le rapport d'activité rédigé pour le dirigeant.",
  input_schema: {
    type: 'object',
    properties: {
      synthese: { type: 'string', description: '3-4 phrases : résultat N vs N-1, tendance, risques majeurs nommés' },
      produits: { type: 'string', description: 'Analyse des produits : postes nommés, évolution vs N-1/budget, fréquence/montant moyen' },
      charges: { type: 'string', description: 'Analyse des charges : postes qui pèsent/dérapent (nommés), fréquence, montant moyen' },
      immobilisations: { type: ['string', 'null'], description: 'Immobilisations et impact sur amortissements, ou null si aucune' },
      clients_analyse: { type: 'string', description: 'Délais clients : comment chaque gros client nommé impacte le délai global' },
      fournisseurs_analyse: { type: 'string', description: 'Délais fournisseurs : comment chaque fournisseur nommé impacte le délai global' },
      actions_clients: {
        type: 'array',
        items: { type: 'object', properties: { client: { type: 'string' }, constat: { type: 'string' }, action: { type: 'string' } }, required: ['client', 'constat', 'action'] },
      },
      actions_fournisseurs: {
        type: 'array',
        items: { type: 'object', properties: { fournisseur: { type: 'string' }, constat: { type: 'string' }, action: { type: 'string' } }, required: ['fournisseur', 'constat', 'action'] },
      },
      actions_postes: {
        type: 'array',
        items: { type: 'object', properties: { poste: { type: 'string' }, constat: { type: 'string' }, action: { type: 'string' } }, required: ['poste', 'constat', 'action'] },
      },
      points_forts: { type: 'array', items: { type: 'string' } },
      alertes: { type: 'array', items: { type: 'string' } },
    },
    required: ['synthese', 'produits', 'charges', 'clients_analyse', 'fournisseurs_analyse', 'actions_clients', 'actions_fournisseurs', 'actions_postes', 'points_forts', 'alertes'],
  },
} as const

// Allège les données envoyées à Claude (l'UI garde le détail complet de son côté).
function compact(d: any) {
  const topLignes = (arr: any[] = [], n = 10) => arr.slice(0, n).map(l => ({
    compte: l.label, totalN: Math.round(l.totalN), totalN1: Math.round(l.totalN1),
    budget: Math.round(l.budget), freq: l.frequency, moyenne: Math.round(l.avgAmount),
    poidsPct: Math.round(l.sharePct), varN1Pct: l.varN1Pct != null ? Math.round(l.varN1Pct) : null,
    varBudgetPct: l.varBudgetPct != null ? Math.round(l.varBudgetPct) : null,
  }))
  const topTiers = (arr: any[] = [], n = 10) => arr.slice(0, n).map(t => ({
    nom: t.name, totalN: Math.round(t.totalN), nbFactures: t.nbFactures,
    delaiMoyenJours: t.delaiMoyen != null ? Math.round(t.delaiMoyen) : null,
    poidsPct: Math.round(t.sharePct),
    contributionDelaiJours: t.contributionDelai != null ? Math.round(t.contributionDelai) : null,
    nbImpayes: t.nbImpayes,
  }))
  return {
    exerciceN: d.exerciceN, exerciceN1: d.exerciceN1,
    resultatN: Math.round(d.resultatN), resultatN1: Math.round(d.resultatN1),
    totalProduits: { N: Math.round(d.totalProduitsN), N1: Math.round(d.totalProduitsN1), budget: Math.round(d.totalProduitsBudget) },
    totalCharges: { N: Math.round(d.totalChargesN), N1: Math.round(d.totalChargesN1), budget: Math.round(d.totalChargesBudget) },
    produitsFamilles: topLignes(d.produitsFamilles, 8),
    produitsDetail: topLignes(d.produitsDetail, 10),
    chargesFamilles: topLignes(d.chargesFamilles, 8),
    chargesDetail: topLignes(d.chargesDetail, 12),
    immobilisations: topLignes(d.immobilisations, 8),
    amortissements: topLignes(d.amortissements, 8),
    delaiMoyenClientGlobalJours: d.delaiMoyenClientGlobal != null ? Math.round(d.delaiMoyenClientGlobal) : null,
    delaiMoyenFournGlobalJours: d.delaiMoyenFournGlobal != null ? Math.round(d.delaiMoyenFournGlobal) : null,
    clients: topTiers(d.clients, 12),
    fournisseurs: topTiers(d.fournisseurs, 12),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: corsHeaders })

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } })

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: corsHeaders })

    const body = await req.json() as { rapportData: Record<string, unknown>; tenantId: string; companyKey: string }
    const { rapportData, tenantId, companyKey } = body
    if (!rapportData || !tenantId || !companyKey) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: corsHeaders })
    }

    const { data: roles } = await sb.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const isSuperadmin = (roles ?? []).some(r => r.role === 'superadmin')
    const hasTenantRole = (roles ?? []).some(r => r.tenant_id === tenantId && ['admin', 'comptable'].includes(r.role))
    if (!isSuperadmin && !hasTenantRole) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: corsHeaders })
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const systemPrompt = `Tu es un expert-comptable qui rédige un rapport d'activité ACTIONNABLE pour un dirigeant. Tu compares l'exercice N à N-1 et au budget.
Règles :
- NOMME toujours les clients, fournisseurs et postes concernés (noms fournis dans les données). Jamais d'analyse anonyme.
- Pas de jargon (pas de "DSO", "z-score"). Chiffres arrondis en euros et en jours.
- DÉLAIS : explique comment chaque tiers nommé tire la moyenne globale (le champ contributionDelaiJours indique son impact pondéré).
- CHARGES/PRODUITS : commente fréquence, montant moyen, poids, évolution vs N-1 et budget. Signale les dérapages.
- IMMOBILISATIONS : impact sur les amortissements.
- Chaque action concrète et nominative. Appelle l'outil rapport_activite avec ton analyse.`

    const userPrompt = `Données de l'exercice (montants en euros, délais en jours) :\n\n${JSON.stringify(compact(rapportData), null, 2)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: [RAPPORT_TOOL as any],
      tool_choice: { type: 'tool', name: 'rapport_activite' },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = response.content.find((c: any) => c.type === 'tool_use') as any
    if (!toolUse?.input) throw new Error('Claude n\'a pas renvoyé de rapport structuré')
    const rapportJson = toolUse.input as Record<string, unknown>

    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: saved, error: saveError } = await sbAdmin.from('rapports').insert({
      tenant_id: tenantId, company_key: companyKey,
      period_start: `${(rapportData as any).exerciceN}-01-01`,
      period_end: `${(rapportData as any).exerciceN}-12-31`,
      data_json: rapportData, rapport_json: rapportJson,
    }).select('id').single()
    if (saveError) console.error('[rapports] save error:', saveError.message)

    return new Response(JSON.stringify({ rapportJson, rapportId: saved?.id ?? null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[generate-rapport]', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
