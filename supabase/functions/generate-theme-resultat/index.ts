import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Brique « thème » réutilisable — Thème 1 « Le résultat, en clair ».
// Sortie structurée (forced tool_use) → JSON garanti, pas de parsing fragile.
const THEME_TOOL = {
  name: 'theme_resultat',
  description: 'Enregistre le Thème 1 (résultat) rédigé pour le dirigeant.',
  input_schema: {
    type: 'object',
    properties: {
      titre:            { type: 'string', description: 'Titre court et parlant du thème' },
      le_chiffre_cle:   { type: 'string', description: 'Le résultat en clair : ce qui reste après avoir vendu et engagé toutes les charges. 2-3 phrases très simples. JAMAIS de vocabulaire de trésorerie.' },
      ou_on_se_situe:   { type: 'string', description: 'Comparaison au même période N-1 ET au budget : mieux/moins bien, de combien en € et en %.' },
      pourquoi:         { type: 'string', description: 'Explication descendante : quelles grandes masses (produits, charges) et quels 2-3 comptes comptables nommés expliquent la variation. Pédagogue.' },
      ce_que_ca_veut_dire: { type: 'array', items: { type: 'string' }, description: '2 à 4 messages de pilotage courts pour le dirigeant (pas de nouveau chiffre).' },
      intra_groupe:     { type: ['string', 'null'], description: 'Analyse à part des flux intra-groupe (ex : honoraires versés à la holding) : montant, tendance, point de vigilance. null si aucun flux intra-groupe.' },
    },
    required: ['titre', 'le_chiffre_cle', 'ou_on_se_situe', 'pourquoi', 'ce_que_ca_veut_dire'],
  },
} as const

// Allège les données envoyées au modèle (l'UI garde le détail complet).
function compact(d: any) {
  const masse = (arr: any[] = [], n = 6) => arr.slice(0, n).map(l => ({
    poste: l.label, N: Math.round(l.totalN), N1: Math.round(l.totalN1), budget: Math.round(l.budget),
    varN1Pct: l.varN1Pct != null ? Math.round(l.varN1Pct) : null,
    varBudgetPct: l.varBudgetPct != null ? Math.round(l.varBudgetPct) : null,
  }))
  return {
    societe: d.companyLabel, perimetre: d.scope,   // 'societe' | 'groupe'
    exerciceN: d.exerciceN, exerciceN1: d.exerciceN1,
    nbMois: d.nbMois, periodeComplete: d.periodeComplete,
    resultat: { N: Math.round(d.resultatN), N1: Math.round(d.resultatN1), budget: Math.round(d.resultatBudget), budgetDisponible: !!d.hasBudget },
    produits: { N: Math.round(d.produitsN), N1: Math.round(d.produitsN1), budget: Math.round(d.produitsBudget) },
    charges:  { N: Math.round(d.chargesN),  N1: Math.round(d.chargesN1),  budget: Math.round(d.chargesBudget) },
    grandesMassesProduits: masse(d.produitsMasses),
    grandesMassesCharges:  masse(d.chargesMasses),
    principauxMouvements:  masse(d.topMovers, 8),
    fluxIntraGroupe: (d.intraGroup ?? []).slice(0, 8).map((f: any) => ({
      societe: f.company, entite: f.entity, compte: f.account, libelle: f.label,
      sens: f.sens, montantN: Math.round(f.montantN), montantN1: Math.round(f.montantN1),
    })),
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

    const body = await req.json() as { themeData: Record<string, unknown>; tenantId: string }
    const { themeData, tenantId } = body
    if (!themeData || !tenantId) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: corsHeaders })
    }

    const { data: roles } = await sb.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const isSuperadmin = (roles ?? []).some(r => r.role === 'superadmin')
    const hasTenantRole = (roles ?? []).some(r => r.tenant_id === tenantId && ['admin', 'comptable'].includes(r.role))
    if (!isSuperadmin && !hasTenantRole) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: corsHeaders })
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const systemPrompt = `Tu rédiges le THÈME 1 « Le résultat, en clair » d'un rapport de pilotage pour un dirigeant, selon la méthode ADAM Boards.
Règles ABSOLUES :
- PÉDAGOGIE MAXIMALE : explique comme à un enfant de 10 ans. Phrases courtes, mots simples, une analogie de bon sens si utile.
- COMPTE DE RÉSULTAT UNIQUEMENT. Le résultat = ce qui reste une fois qu'on a vendu ET qu'on a compté (engagé) toutes les charges. INTERDIT d'utiliser le vocabulaire de trésorerie : « encaissé », « payé », « argent en banque », « décaissé », « paiement ». (La trésorerie sera un autre thème.)
- Analyse HORS OD (écritures d'inventaire de clôture déjà exclues des chiffres fournis) — ne le mentionne pas, c'est acquis.
- Analyse DESCENDANTE : d'abord le résultat, puis POURQUOI il bouge via les grandes masses (produits, charges), en nommant les 2-3 comptes comptables qui pèsent le plus.
- Toujours comparer au MÊME période N-1 et au BUDGET. Chiffres arrondis, en euros et en %. Si periodeComplete=false, précise « sur les {nbMois} premiers mois » et ne projette pas sur l'année. Si budgetDisponible=false, ne parle pas du budget.
- INTRA-GROUPE : s'il y a des fluxIntraGroupe, remplis « intra_groupe » : nomme l'entité (ex : la holding GBP), le montant et son évolution, et pose le point de vigilance. Ces flux restent DANS le résultat (on ne les retire pas), on les analyse à part. Sinon mets null.
- Ne dramatise pas, reste factuel et utile au pilotage. Appelle l'outil theme_resultat.`

    const userPrompt = `Données du thème (montants en euros) :\n\n${JSON.stringify(compact(themeData), null, 2)}`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 3000,
      system: systemPrompt,
      tools: [THEME_TOOL as any],
      tool_choice: { type: 'tool', name: 'theme_resultat' },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = response.content.find((c: any) => c.type === 'tool_use') as any
    if (!toolUse?.input) throw new Error('Le modèle n\'a pas renvoyé de thème structuré')

    return new Response(JSON.stringify({ themeJson: toolUse.input }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[generate-theme-resultat]', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
