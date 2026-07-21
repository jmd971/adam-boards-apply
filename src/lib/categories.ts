import type { ManualEntry } from '@/types'

export const CATEGORIES = [
  { cat: 'Vente', acc: '706', subs: [
    'Ventes de marchandises (707)','Prestations de services (706)','Travaux (704)',
    'Négoce (707)','Location de biens (713)','Commissions reçues (708)',
    'Subventions (740)','Revenus financiers (76)','Reprises sur provisions (781)',
    'Activité annexe (708)','Autre produit (70)',
  ]},
  { cat: 'Achat', acc: '607', subs: [
    'Achats de marchandises (607)','Matières premières (601)','Matières consommables (602)',
    'Fournitures non stockées (606)','Emballages (603)','Achat de sous-traitance (604)',
    'Variation de stocks (603)','Autre achat (609)',
  ]},
  { cat: 'Depense', acc: '626', subs: [
    'Loyer et charges locatives (613/614)','Crédit-bail (612)','Entretien et réparations (615)',
    'Assurances (616)','Documentation et abonnements (618)','Concessions et brevets (611)',
    'Personnel extérieur (621)','Honoraires et commissions (622)','Frais d\'actes et contentieux (622)',
    'Publicité et marketing (623)','Frais de représentation (623)','Cadeaux clients (623)',
    'Transports sur achats (624)','Transports sur ventes (624)',
    'Déplacements et missions (625)','Repas d\'affaires (625)','Carburant (625)',
    'Téléphone et Internet (626)','Affranchissements (626)','Services bancaires (627)',
    'Cotisations professionnelles (628)',
    'Formation professionnelle (633)','Taxe apprentissage (632)','Taxe foncière (635)',
    'CFE / CVAE (635)','TVA non récupérable (635)','Autres impôts et taxes (635)',
    'Salaires bruts (641)','Primes et intéressements (648)','Charges patronales URSSAF (645)',
    'Mutuelle et prévoyance (646)','Retraite complémentaire (645)',
    'Créances irrécouvrables (654)','Redevances et royalties (651)',
    'Intérêts bancaires (661)','Charges sur emprunts (661)',
    'Charges exceptionnelles (671)',
    'Dotations aux amortissements (681)','Dotations aux provisions (681)',
    'Electricité / Energie (606)','Eau (606)','Fournitures de bureau (606)',
    'Abonnements logiciels (618)','Autre charge (658)',
  ]},
  { cat: 'Immobilisation', acc: '2181', subs: [
    'Logiciels et licences (205)','Brevets et marques (205)','Fonds commercial (207)',
    'Matériel informatique (2183)','Matériel de bureau (2184)','Mobilier (2184)',
    'Agencements et installations (2131)','Matériel de transport (2182)',
    'Matériel industriel (2154)','Matériel médical (2186)',
    'Constructions (213)','Terrains (211)',
    'Participations (261)','Dépôts et cautionnements (275)',
    'Autre immobilisation (218)',
  ]},
] as { cat: ManualEntry['category']; subs: string[]; acc: string }[]

export const SUB_ALIASES: Record<string, string[]> = {
  'Loyer et charges locatives (613/614)':   ['loyer','bail','location bureau','charges locatives'],
  'Crédit-bail (612)':                       ['leasing','credit bail','loa','location financière'],
  'Entretien et réparations (615)':          ['entretien','réparation','maintenance','dépannage'],
  'Assurances (616)':                        ['assurance','rc pro','responsabilité civile','multirisque'],
  'Abonnements logiciels (618)':             ['logiciel','saas','abonnement','licence','microsoft','adobe','slack','notion','office 365','google workspace'],
  'Documentation et abonnements (618)':      ['abonnement presse','documentation','revue','journal'],
  'Honoraires et commissions (622)':         ['honoraires','expert comptable','avocat','commission','consultant','freelance'],
  'Publicité et marketing (623)':            ['publicité','marketing','pub','facebook ads','google ads','communication'],
  'Cadeaux clients (623)':                   ['cadeaux','goodies','coffret'],
  'Transports sur achats (624)':             ['transport achat','livraison fournisseur','frais port','chronopost'],
  'Transports sur ventes (624)':             ['transport vente','expedition','colis','colissimo'],
  'Déplacements et missions (625)':          ['déplacement','voyage','train','avion','hôtel','taxi','uber','note de frais'],
  'Repas d\'affaires (625)':                 ['restaurant','repas','déjeuner','dîner','repas affaires'],
  'Carburant (625)':                         ['carburant','essence','gasoil','diesel','péage'],
  'Téléphone et Internet (626)':             ['téléphone','internet','mobile','forfait','sfr','orange','free','bouygues','fibre'],
  'Affranchissements (626)':                 ['affranchissement','courrier','timbre','la poste'],
  'Services bancaires (627)':                ['frais bancaires','agios','commission bancaire','carte bancaire'],
  'Cotisations professionnelles (628)':      ['cotisation','syndicat','chambre de commerce','cci','adhésion'],
  'Formation professionnelle (633)':         ['formation','stage','cpf','opco','séminaire'],
  'Taxe foncière (635)':                     ['taxe foncière','foncier'],
  'CFE / CVAE (635)':                        ['cfe','cvae','taxe professionnelle'],
  'TVA non récupérable (635)':               ['tva non récupérable'],
  'Autres impôts et taxes (635)':            ['impôts','taxes','contribution'],
  'Salaires bruts (641)':                    ['salaire','salaires','rémunération','paie','bulletin de salaire'],
  'Primes et intéressements (648)':          ['prime','intéressement','participation','bonus'],
  'Charges patronales URSSAF (645)':         ['urssaf','charges patronales','cotisations sociales','charges sociales'],
  'Mutuelle et prévoyance (646)':            ['mutuelle','prévoyance santé','complémentaire santé'],
  'Retraite complémentaire (645)':           ['retraite','arrco','agirc'],
  'Intérêts bancaires (661)':                ['intérêts','emprunt','crédit','prêt bancaire'],
  'Dotations aux amortissements (681)':      ['amortissement','dotation'],
  'Electricité / Energie (606)':             ['électricité','énergie','edf','engie','gaz','chauffage'],
  'Eau (606)':                               ['eau','véolia'],
  'Fournitures de bureau (606)':             ['fournitures','papeterie','bureau','papier','encre','toner'],
  'Achats de marchandises (607)':            ['marchandises','produits revendus','stock','négoce'],
  'Matières premières (601)':                ['matières premières','matériaux','composants'],
  'Achat de sous-traitance (604)':           ['sous-traitance','prestataire','façonnage'],
  'Prestations de services (706)':           ['prestation','facturation','mission','consulting','services rendus'],
  'Ventes de marchandises (707)':            ['vente','marchandises vendues','revente'],
  'Subventions (740)':                       ['subvention','aide','bpifrance'],
}

/** Normalise pour la recherche : minuscules + sans accents */
export function normSub(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['']/g, "'")
}

/** Extrait le numéro de compte d'un libellé de sous-catégorie : "Publicité (623)" → "623" */
export function extractAcc(sub: string, fallback: string): string {
  const m = sub.match(/\((\d[\d/]*)\)/)
  if (m) return m[1].split('/')[0]
  // Sous-catégorie fournie directement comme code comptable brut (ex : colonne
  // « Code comptable » d'un export Axonaut : "6233") → utiliser le code tel quel.
  const raw = sub.trim().match(/^\d{3,}$/)
  if (raw) return raw[0]
  return fallback
}
