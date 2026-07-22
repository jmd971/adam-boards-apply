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
      titre: { type: 'string', description: 'Titre en UNE phrase courte qui capte le message principal (ex : "Résultat en repli, sous l\'effet du recul des ventes").' },
      essentiel: { type: 'array', items: { type: 'string' }, description: 'EXACTEMENT 3 messages clés à retenir, le plus important en premier. Chaque message = 1 phrase courte AVEC un chiffre.' },
      produits: { type: 'array', items: { type: 'string' }, description: '3 à 5 puces courtes. Format : poste ou client nommé + constat chiffré (évolution vs N-1 et/ou budget). Une seule idée par puce.' },
      charges: { type: 'array', items: { type: 'string' }, description: '3 à 5 puces courtes : postes nommés qui pèsent ou dérapent, chiffrés (vs N-1 / budget).' },
      immobilisations: { type: ['array', 'null'], items: { type: 'string' }, description: 'Puces sur immobilisations et impact amortissements si significatif, sinon null.' },
      delais_clients: { type: 'array', items: { type: 'string' }, description: '2 à 4 puces : délai moyen global (jours) + QUELS clients nommés tirent la moyenne (impact via contributionDelaiJours) + impayés éventuels. Chiffré.' },
      delais_fournisseurs: { type: 'array', items: { type: 'string' }, description: '2 à 4 puces : délai moyen global fournisseurs + fournisseurs nommés qui pèsent. Chiffré.' },
      points_forts: { type: 'array', items: { type: 'string' }, description: '2 à 4 points forts, courts et chiffrés.' },
      alertes: { type: 'array', items: { type: 'string' }, description: '2 à 5 points de vigilance / risques, courts, chiffrés et nommés.' },
      plan_action: {
        type: 'array',
        description: '3 à 6 actions priorisées (priorité "haute" en premier), les plus impactantes, nominatives et concrètes.',
        items: {
          type: 'object',
          properties: {
            priorite: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
            cible: { type: 'string', description: 'Client, fournisseur ou poste nommé concerné.' },
            constat: { type: 'string', description: 'Constat chiffré en 1 phrase courte.' },
            action: { type: 'string', description: 'Action concrète recommandée.' },
            impact: { type: 'string', description: 'Impact estimé, en € si possible (ex : "+89 k€ CA", "+2 pts marge") sinon "fiabilité" / "structurel".' },
          },
          required: ['priorite', 'cible', 'constat', 'action'],
        },
      },
    },
    required: ['titre', 'essentiel', 'produits', 'charges', 'delais_clients', 'delais_fournisseurs', 'points_forts', 'alertes', 'plan_action'],
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
    nbMois: d.nbMois, periodeComplete: d.periodeComplete,
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

    const systemPrompt = `Tu rédiges le rapport d'activité d'une TPE/PME pour son DIRIGEANT (pas pour un comptable). Objectif : lisible en une minute, actionnable.

STYLE — impératif :
- Phrases COURTES. UNE seule idée par puce. TOUJOURS un chiffre (€ arrondis, %, jours).
- ZÉRO jargon (jamais "DSO", "z-score", "EBE", "BFR"...). Parle cash : "ce client ne commande plus", "les achats mangent la marge".
- NOMME les clients, fournisseurs et postes (noms fournis dans les données). Jamais d'analyse anonyme.
- Hiérarchise par IMPACT : le plus important d'abord (dans "essentiel" et "plan_action").
- N'invente aucun chiffre : n'utilise que les données fournies.

CONTENU :
- titre : une phrase qui résume LE message principal.
- essentiel : 3 messages, le retournement / le chiffre clé d'abord.
- produits / charges : puces "poste nommé : constat chiffré (vs N-1 / budget)". Signale les postes qui pèsent et les dérapages.
- delais_clients / delais_fournisseurs : délai moyen global + QUI tire la moyenne (contributionDelaiJours) + impayés. Chiffré, nommé.
- points_forts / alertes : courts, chiffrés, nommés.
- plan_action : 3 à 6 actions, priorité "haute" d'abord, chacune avec un impact chiffré si possible (€ ou points de marge).

PÉRIODE : si periodeComplete=false, l'analyse porte sur nbMois mois ; N-1 et budget sont déjà restreints à CETTE MÊME PÉRIODE. Dis-le (ex : "sur les 5 premiers mois") et ne projette pas sur l'année.

Appelle l'outil rapport_activite.`

    const userPrompt = `Données de l'exercice (montants en euros, délais en jours) :\n\n${JSON.stringify(compact(rapportData), null, 2)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
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
