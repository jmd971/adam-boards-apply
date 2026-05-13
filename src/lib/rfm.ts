export type RFMSegment = 'champion' | 'fidele' | 'potentiel' | 'one_shot' | 'a_risque' | 'perdu'

export interface SaleTransaction {
  client_key:    string
  client_nom:    string
  client_email?: string
  client_phone?: string
  date_achat:    string
  montant:       number
  produit?:      string
  commande_ref?: string
}

export interface ClientRFM {
  key:           string
  nom:           string
  email?:        string
  phone?:        string
  ca:            number
  nbVisites:     number
  lastDate:      string
  daysSinceLast: number
  scoreR:        1 | 2 | 3 | 4
  scoreF:        1 | 2 | 3 | 4
  scoreM:        1 | 2 | 3 | 4
  segment:       RFMSegment
  transactions:  SaleTransaction[]
}

export const SEGMENT_LABELS: Record<RFMSegment, string> = {
  champion:  'Champion',
  fidele:    'Fidèle',
  potentiel: 'Potentiel',
  one_shot:  'One-shot',
  a_risque:  'À risque',
  perdu:     'Perdu',
}

export const SEGMENT_COLORS: Record<RFMSegment, string> = {
  champion:  'var(--green)',
  fidele:    'var(--blue)',
  potentiel: '#22d3ee',
  one_shot:  'var(--amber)',
  a_risque:  '#f97316',
  perdu:     'var(--red)',
}

export const SEGMENT_ACTIONS: Record<RFMSegment, { title: string; desc: string }[]> = {
  champion: [
    { title: 'Programme fidélité VIP',   desc: 'Offre exclusive réservée à vos meilleurs clients' },
    { title: 'Demande de parrainage',    desc: 'Invitez-les à recommander vos services contre une récompense' },
    { title: 'Invitation événement',     desc: 'Avant-première, journée portes ouvertes, atelier' },
  ],
  fidele: [
    { title: 'Offre anniversaire',       desc: 'Remise spéciale le mois de leur anniversaire' },
    { title: 'Upsell service premium',   desc: 'Proposez une montée en gamme ou un package' },
    { title: 'Carte de remerciement',    desc: 'Message personnalisé pour renforcer la relation' },
  ],
  potentiel: [
    { title: 'Séquence 2ème visite',     desc: 'Email J+15 avec incitation à revenir' },
    { title: 'Offre de bienvenue',       desc: 'Remise valable sur les 3 prochains mois' },
    { title: 'Enquête satisfaction',     desc: 'Récoltez leur avis et montrez que vous écoutez' },
  ],
  one_shot: [
    { title: 'Campagne réactivation',    desc: 'Email "On vous manque" avec remise 10%' },
    { title: 'Offre 2ème chance',        desc: 'Promotion valable 30 jours' },
    { title: 'Enquête post-achat',       desc: 'Comprendre pourquoi ils ne sont pas revenus' },
  ],
  a_risque: [
    { title: 'Email "On vous manque"',   desc: 'Message personnalisé avec offre de retour' },
    { title: 'Appel commercial',         desc: 'Contact direct pour comprendre et reconquérir' },
    { title: 'Offre spéciale retour',    desc: 'Remise exceptionnelle limitée dans le temps' },
  ],
  perdu: [
    { title: 'Campagne "Dernière chance"', desc: 'Offre agressive pour tenter une réactivation' },
    { title: 'Sondage de départ',        desc: 'Comprendre pourquoi ils sont partis' },
  ],
}

function scoreR(days: number): 1 | 2 | 3 | 4 {
  if (days <= 30)  return 4
  if (days <= 90)  return 3
  if (days <= 180) return 2
  return 1
}

function scoreF(visits: number): 1 | 2 | 3 | 4 {
  if (visits >= 8) return 4
  if (visits >= 4) return 3
  if (visits >= 2) return 2
  return 1
}

function scoreM(ca: number, sortedCAs: number[]): 1 | 2 | 3 | 4 {
  const n = sortedCAs.length
  if (n === 0) return 1
  const q = (p: number) => sortedCAs[Math.min(Math.floor(n * p), n - 1)] ?? 0
  if (ca >= q(0.75)) return 4
  if (ca >= q(0.50)) return 3
  if (ca >= q(0.25)) return 2
  return 1
}

function classify(r: number, f: number, m: number): RFMSegment {
  if (f === 1)                     return 'one_shot'
  if (r >= 3 && f >= 3 && m >= 3) return 'champion'
  if (f >= 3 && m >= 2)           return 'fidele'
  if (r >= 3 && f <= 2)           return 'potentiel'
  if (r <= 2 && f >= 3)           return 'a_risque'
  return 'perdu'
}

export function computeRFM(txs: SaleTransaction[], refDate?: Date): ClientRFM[] {
  if (!txs.length) return []
  const ref = refDate ?? new Date()

  const groups = new Map<string, SaleTransaction[]>()
  for (const t of txs) {
    if (!groups.has(t.client_key)) groups.set(t.client_key, [])
    groups.get(t.client_key)!.push(t)
  }

  const raw = Array.from(groups.entries()).map(([key, list]) => {
    const nom           = list[0].client_nom
    const email         = list.find(t => t.client_email)?.client_email
    const phone         = list.find(t => t.client_phone)?.client_phone
    const ca            = list.reduce((s, t) => s + t.montant, 0)
    const visits        = new Set(list.map(t => t.commande_ref || t.date_achat)).size
    const lastDate      = list.map(t => t.date_achat).sort().slice(-1)[0]
    const daysSinceLast = Math.max(0, Math.floor((ref.getTime() - new Date(lastDate).getTime()) / 86400000))
    return { key, nom, email, phone, ca, nbVisites: visits, lastDate, daysSinceLast, transactions: list }
  })

  const sortedCAs = raw.map(c => c.ca).sort((a, b) => a - b)

  return raw.map(c => ({
    ...c,
    scoreR: scoreR(c.daysSinceLast),
    scoreF: scoreF(c.nbVisites),
    scoreM: scoreM(c.ca, sortedCAs),
    segment: classify(scoreR(c.daysSinceLast), scoreF(c.nbVisites), scoreM(c.ca, sortedCAs)),
  })).sort((a, b) => b.ca - a.ca)
}


export function exportToGHL(clients: ClientRFM[], segment?: RFMSegment): void {
  const list = segment ? clients.filter(c => c.segment === segment) : clients
  if (!list.length) return

  const headers = ['first_name','last_name','email','phone','segment','ca_total','nb_visites','derniere_visite','tags']
  const rows = list.map(c => {
    const parts = c.nom.trim().split(/\s+/)
    return [
      parts[0] ?? '',
      parts.slice(1).join(' '),
      c.email ?? '',
      c.phone ?? '',
      SEGMENT_LABELS[c.segment],
      c.ca.toFixed(2),
      String(c.nbVisites),
      c.lastDate,
      SEGMENT_LABELS[c.segment],
    ]
  })

  const csv = [headers, ...rows]
    .map(r => r.map(v => (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(','))
    .join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ghl_${segment ?? 'tous'}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
