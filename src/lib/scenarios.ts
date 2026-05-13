import type { RFMSegment, ClientRFM } from './rfm'

export type Channel = 'email' | 'sms' | 'call'

export interface ScenarioStep {
  day:     number       // J0, J+7, J+14…
  channel: Channel
  title:   string
  content: string       // template / objet du message
}

export interface CampaignScenario {
  id:              string
  title:           string
  description:     string
  targetSegments:  RFMSegment[]
  expectedImpact:  string         // ex: "Réactiver 10–20% des clients dormants"
  steps:           ScenarioStep[]
}

export const SCENARIOS: CampaignScenario[] = [
  {
    id: 'anti-attrition',
    title: 'Anti-attrition 30 jours',
    description: 'Reconquête progressive des clients dormants ou en train de partir, sur 3 semaines.',
    targetSegments: ['a_risque', 'perdu'],
    expectedImpact: 'Réactiver 10–20% des clients ciblés',
    steps: [
      { day: 0,  channel: 'email', title: '"On vous manque"', content: 'Message personnalisé sans offre — rappeler la relation et inviter à donner des nouvelles.' },
      { day: 7,  channel: 'sms',   title: 'Relance courte',    content: 'Offre douce : -10% sur la prochaine visite, valable 30 jours.' },
      { day: 21, channel: 'email', title: 'Dernière chance',   content: 'Offre agressive (-20% ou geste commercial) si pas de retour.' },
    ],
  },
  {
    id: 'reactivation-one-shot',
    title: 'Réactivation one-shot',
    description: 'Séquence dédiée aux clients qui ne sont venus qu\'une fois — incitation forte à revenir.',
    targetSegments: ['one_shot'],
    expectedImpact: 'Transformer 15–25% des one-shots en clients récurrents',
    steps: [
      { day: 0,  channel: 'email', title: 'Enquête satisfaction', content: 'Qu\'avez-vous pensé de votre visite ? 3 questions, 30 secondes.' },
      { day: 15, channel: 'email', title: 'Offre 2ème visite',    content: 'Code promo personnalisé valable 30 jours sur votre prochaine commande.' },
      { day: 45, channel: 'sms',   title: 'Rappel express',       content: 'Plus que 7 jours pour profiter de votre offre de retour.' },
    ],
  },
  {
    id: 'welcome-potentiel',
    title: 'Onboarding potentiel',
    description: 'Convertir un nouveau client (1-2 visites récentes) en client fidèle régulier.',
    targetSegments: ['potentiel'],
    expectedImpact: 'Passer 30–40% des potentiels en fidèles',
    steps: [
      { day: 0,  channel: 'email', title: 'Bienvenue',                content: 'Merci pour votre confiance + présentation des services / produits phares.' },
      { day: 15, channel: 'email', title: 'Tips & conseils',          content: 'Contenu à valeur ajoutée (sans vente directe) pour ancrer la relation.' },
      { day: 30, channel: 'email', title: 'Offre 3ème commande',      content: 'Avantage à débloquer à la 3ème commande — incite à la régularité.' },
    ],
  },
  {
    id: 'cross-sell-champion',
    title: 'Cross-sell champions & fidèles',
    description: 'Augmenter le panier moyen des meilleurs clients via recommandations ciblées.',
    targetSegments: ['champion', 'fidele'],
    expectedImpact: '+15–25% de panier moyen sur la cible',
    steps: [
      { day: 0,  channel: 'email', title: 'Recommandation perso', content: 'Suggestions de produits / services complémentaires basés sur leur historique.' },
      { day: 14, channel: 'email', title: 'Bundle premium',       content: 'Pack regroupant 2-3 articles à prix avantageux.' },
    ],
  },
  {
    id: 'vip-anniversaire',
    title: 'VIP anniversaire',
    description: 'Renforcer le lien émotionnel avec les champions — moment-clé annuel.',
    targetSegments: ['champion'],
    expectedImpact: 'Maintenir 80%+ de rétention sur les champions',
    steps: [
      { day: 0, channel: 'email', title: 'Carte anniversaire',  content: 'Message personnel + offre exclusive valable 1 mois.' },
      { day: 0, channel: 'sms',   title: 'Rappel le jour J',    content: 'Un mot personnel le jour de l\'anniversaire si possible.' },
    ],
  },
  {
    id: 'parrainage-champions',
    title: 'Parrainage champions',
    description: 'Transformer vos meilleurs clients en ambassadeurs payés.',
    targetSegments: ['champion'],
    expectedImpact: '5–10% de nouveaux clients via parrainage',
    steps: [
      { day: 0,  channel: 'email', title: 'Invitation au programme', content: 'Présentation des bénéfices (filleul + parrain) — code de parrainage unique.' },
      { day: 30, channel: 'email', title: 'Rappel + résultats',      content: 'Bilan personnel : "Vous avez parrainé X amis" ou relance si aucun.' },
    ],
  },
]

export function clientsForScenario(scenario: CampaignScenario, clients: ClientRFM[]): ClientRFM[] {
  const set = new Set(scenario.targetSegments)
  return clients.filter(c => set.has(c.segment))
}
