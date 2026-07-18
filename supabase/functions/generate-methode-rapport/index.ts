// ── Méthode AdamBoards — étape 5 : restitution rédigée ───────────────────────
// L'IA REÇOIT les faits calculés par le moteur déterministe (src/lib/methode.ts)
// et les met en langage dirigeant. Elle ne recalcule JAMAIS un montant.
// Spécification : docs/METHODE_ADAMBOARDS_V1.md

import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const METHODE_TOOL = {
  name: 'rapport_methode',
  description: 'Enregistre la synthèse rédigée du rapport Méthode AdamBoards.',
  input_schema: {
    type: 'object',
    properties: {
      titre: { type: 'string', description: 'Titre du mois en une phrase factuelle (ex : « Un déficit qui se creuse de 3 points de CA »)' },
      messages_cles: {
        type: 'array', items: { type: 'string' },
        description: '3 à 5 messages clés pour le dirigeant, chacun appuyé sur un chiffre fourni. Ordre : du plus important au moins important.',
      },
      lecture_ventes: { type: 'string', description: 'Lecture des produits : expliquer la variation par les éléments fournis (manquants, nouveaux, écarts), tiers nommés.' },
      lecture_charges: { type: 'string', description: 'Lecture des charges : idem, en nommant les postes et tiers qui pèsent ou dérapent.' },
      questions_comptable: {
        type: 'array',
        items: { type: 'object', properties: { sujet: { type: 'string' }, question: { type: 'string' } }, required: ['sujet', 'question'] },
        description: 'Reformulation UNE PAR UNE, DANS LE MÊME ORDRE, des questions fournies (même nombre d\'éléments). Ne pas en inventer, ne pas en supprimer.',
      },
      recommandations_saisie: {
        type: 'array', items: { type: 'string' },
        description: 'Recommandations complémentaires de qualité de saisie déduites des données (ex : analytique par véhicule/site via les libellés). Peut être vide.',
      },
    },
    required: ['titre', 'messages_cles', 'lecture_ventes', 'lecture_charges', 'questions_comptable', 'recommandations_saisie'],
  },
} as const

// Allège les données envoyées à Claude (l'UI garde le détail complet côté client).
function compact(d: any) {
  const fam = (arr: any[] = []) => arr.slice(0, 8).map((f: any) => ({
    famille: `${f.key} ${f.label}`,
    totalN: Math.round(f.totalN), totalN1: Math.round(f.totalN1), variation: Math.round(f.variation),
    comptes: (f.comptes ?? []).slice(0, 6).map((c: any) => ({
      compte: `${c.account} ${c.label}`, od: c.isOD || undefined,
      totalN: Math.round(c.totalN), totalN1: Math.round(c.totalN1), variation: Math.round(c.variation),
      decomposition: {
        manquants: Math.round(c.manquants), nouveaux: Math.round(c.nouveaux),
        ecartsMontant: Math.round(c.ecartsMontant), autres: Math.round(c.residuel),
      },
      principaux: (c.groupes ?? []).slice(0, 5).map((g: any) => ({
        tiers: g.tiers || '(sans tiers)', freq: g.freq, verdict: g.verdict,
        opN1: g.nN1, opN: g.nN, totalN1: Math.round(g.totalN1), totalN: Math.round(g.totalN),
        ecart: Math.round(g.ecart),
      })),
    })),
  }))
  return {
    societe: d.companyLabel,
    exerciceN: d.exerciceN, exerciceN1: d.exerciceN1,
    nbMois: d.nbMois, periodeComplete: d.periodeComplete, histoLimite: d.histoLimite,
    cadrage: {
      resultatN: Math.round(d.resultatN), resultatN1: Math.round(d.resultatN1),
      variation: Math.round(d.variation),
      variationPct: d.variationPct != null ? Math.round(d.variationPct) : null,
      resultatEnPctCA_N: d.resPctCaN != null ? +d.resPctCaN.toFixed(1) : null,
      resultatEnPctCA_N1: d.resPctCaN1 != null ? +d.resPctCaN1.toFixed(1) : null,
      ecartEnPointsDeCA: d.pointsCa != null ? +d.pointsCa.toFixed(1) : null,
      caN: Math.round(d.caN), caN1: Math.round(d.caN1),
    },
    produits: fam(d.produits),
    charges: fam(d.charges),
    questions: (d.questions ?? []).map((q: any) => ({ constat: q.constat, question: q.question })),
    recosSaisie: (d.recos ?? []).map((r: any) => `${r.compte} ${r.compteLabel} — ${r.motif}`),
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

    const body = await req.json() as { methodeData: Record<string, unknown>; tenantId: string; companyKey: string }
    const { methodeData, tenantId, companyKey } = body
    if (!methodeData || !tenantId || !companyKey) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants' }), { status: 400, headers: corsHeaders })
    }

    const { data: roles } = await sb.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const isSuperadmin = (roles ?? []).some(r => r.role === 'superadmin')
    const hasTenantRole = (roles ?? []).some(r => r.tenant_id === tenantId && ['admin', 'comptable'].includes(r.role))
    if (!isSuperadmin && !hasTenantRole) {
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403, headers: corsHeaders })
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const systemPrompt = `Tu rédiges la synthèse du rapport mensuel « Méthode AdamBoards » pour un chef d'entreprise NON financier.
Les chiffres fournis sont calculés de manière déterministe depuis les écritures comptables : tu ne recalcules RIEN, tu ne modifies AUCUN montant, tu mets en mots.
Règles :
- Langage dirigeant : zéro jargon comptable (pas de « SIG », « OD », « solde débiteur »), montants arrondis en euros.
- La métrique de référence est le résultat en % du chiffre d'affaires et son écart en POINTS (champ ecartEnPointsDeCA). Utilise-la dans le titre ou le 1er message clé.
- NOMME les tiers et les postes concernés (fournis dans « principaux »). Jamais d'analyse anonyme.
- Chaque variation s'explique par sa décomposition : manquants (opérations attendues absentes), nouveaux, écarts de montant, autres. Appuie-toi dessus.
- PÉRIODE : si periodeComplete=false, tout est comparé « à même période » sur nbMois mois — dis-le et ne projette pas sur l'année.
- Si histoLimite=true : pas d'exercice précédent, contente-toi de décrire la structure du résultat et indique que l'analyse des écarts viendra avec le FEC précédent.
- questions_comptable : reformule les questions fournies une par une, dans le même ordre, même nombre. Ton factuel et cordial.
Appelle l'outil rapport_methode avec ta synthèse.`

    const userPrompt = `Données du rapport (montants en euros) :\n\n${JSON.stringify(compact(methodeData), null, 2)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: [METHODE_TOOL as any],
      tool_choice: { type: 'tool', name: 'rapport_methode' },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = response.content.find((c: any) => c.type === 'tool_use') as any
    if (!toolUse?.input) throw new Error('Claude n\'a pas renvoyé de synthèse structurée')
    const methodeJson = toolUse.input as Record<string, unknown>

    const monthsN = (methodeData as any).monthsN as string[] | undefined
    const periodStart = monthsN?.length ? `${monthsN[0]}-01` : `${(methodeData as any).exerciceN}-01-01`
    const periodEnd   = monthsN?.length ? `${monthsN[monthsN.length - 1]}-28` : `${(methodeData as any).exerciceN}-12-31`

    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: saved, error: saveError } = await sbAdmin.from('rapports').insert({
      tenant_id: tenantId, company_key: companyKey,
      period_start: periodStart, period_end: periodEnd,
      data_json: compact(methodeData),
      rapport_json: { type: 'methode', ...methodeJson },
    }).select('id').single()
    if (saveError) console.error('[rapports] save error:', saveError.message)

    return new Response(JSON.stringify({ methodeJson, rapportId: saved?.id ?? null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[generate-methode-rapport]', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
