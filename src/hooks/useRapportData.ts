import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fiscalYearOf, currentFiscalYear, fiscalMonthIndex } from '@/lib/calc'
import type { ManualEntry, CompanyRaw, FecAccount, BilanAccount } from '@/types'

// ── Types de sortie ─────────────────────────────────────────────────────────

/** Une ligne d'analyse par compte (ou famille de comptes). */
export interface CompteLigne {
  account: string          // n° de compte ou préfixe famille
  label: string
  totalN: number
  totalN1: number
  budget: number
  frequency: number        // nombre d'écritures sur N
  avgAmount: number        // totalN / frequency
  sharePct: number         // % du total de la catégorie (produits / charges / immo)
  varN1Pct: number | null  // évolution vs N-1
  varBudgetPct: number | null
}

/** Analyse nominative d'un tiers (client ou fournisseur) avec son délai. */
export interface TiersDelai {
  name: string
  totalN: number
  nbFactures: number
  delaiMoyen: number | null        // jours moyens entre facture et paiement
  sharePct: number                 // poids dans le total clients/fournisseurs
  contributionDelai: number | null // sharePct/100 × delaiMoyen → contribution au délai global pondéré
  nbImpayes: number                // factures sans date de paiement
  source: 'FEC' | 'saisie' | 'FEC+saisie'  // origine des données du tiers
}

export interface RapportData {
  exerciceN: number
  exerciceN1: number
  companyKeys: string[]
  /** Période de comparaison : N-1 et budget restreints aux mois disponibles de N. */
  nbMois: number          // nombre de mois de N pris en compte (ex : 4)
  periodeComplete: boolean // true si l'exercice N couvre 12 mois

  // Produits (comptes 7x)
  produitsFamilles: CompteLigne[]
  produitsDetail: CompteLigne[]
  totalProduitsN: number
  totalProduitsN1: number
  totalProduitsBudget: number

  // Charges (comptes 6x)
  chargesFamilles: CompteLigne[]
  chargesDetail: CompteLigne[]
  totalChargesN: number
  totalChargesN1: number
  totalChargesBudget: number

  // Immobilisations (bilan classe 2) + amortissements
  immobilisations: CompteLigne[]   // comptes 20/21/23…
  amortissements: CompteLigne[]    // 28x (cumul bilan) + 681 (dotation P&L)

  // Résultat
  resultatN: number
  resultatN1: number

  // Tiers nominatifs + délais
  clients: TiersDelai[]
  fournisseurs: TiersDelai[]
  delaiMoyenClientGlobal: number | null   // moyenne pondérée par le poids de chaque client
  delaiMoyenFournGlobal: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const isCharge = (acc: string) => acc.startsWith('6')
const isProduit = (acc: string) => acc.startsWith('7')

/** Solde net d'un compte FEC (charge: débit-crédit, produit: crédit-débit).
 *  monthsMM (optionnel) : ne somme que les mois dont le numéro (MM) est dans le set
 *  → comparaison « à même période » (N-1 restreint aux mois disponibles de N). */
function soldeFec(fa: FecAccount, charge: boolean, monthsMM?: Set<string>): number {
  let d = 0, c = 0
  for (const [m, v] of Object.entries(fa.mo)) {
    if (monthsMM && !monthsMM.has(m.slice(5, 7))) continue
    d += v[0]; c += v[1]
  }
  return charge ? d - c : c - d
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function pctVar(n: number, ref: number): number | null {
  return ref !== 0 ? ((n - ref) / Math.abs(ref)) * 100 : null
}

/** Agrège les comptes d'une classe (préfixe) en lignes détaillées + familles. */
function aggregateAccounts(
  companies: CompanyRaw[],
  predicate: (acc: string) => boolean,
  charge: boolean,
  monthsMM: Set<string>,      // mois (MM) disponibles dans N → période de comparaison
  budgetIdx: Set<number>,     // index fiscaux (0-11) correspondants pour le budget
): { detail: CompteLigne[]; familles: CompteLigne[]; totalN: number; totalN1: number; totalBudget: number } {
  // acc -> { totalN, totalN1, budget, freq, label }
  const map = new Map<string, { totalN: number; totalN1: number; budget: number; freq: number; label: string }>()

  for (const co of companies) {
    // N
    for (const [acc, fa] of Object.entries(co.pn ?? {})) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: fa.l }
      e.totalN += soldeFec(fa, charge)
      e.freq   += fa.e?.length ?? 0
      if (!e.label) e.label = fa.l
      map.set(acc, e)
    }
    // N-1
    for (const [acc, fa] of Object.entries(co.p1 ?? {})) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: fa.l }
      e.totalN1 += soldeFec(fa, charge, monthsMM)
      if (!e.label) e.label = fa.l
      map.set(acc, e)
    }
    // Budget : seulement les mois correspondant à la période de N (même période)
    for (const [acc, ba] of Object.entries(co.bud ?? {})) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: ba.l }
      e.budget += (ba.b ?? []).reduce((s, v, i) => budgetIdx.has(i) ? s + v : s, 0)
      if (!e.label) e.label = ba.l
      map.set(acc, e)
    }
  }

  const totalN = [...map.values()].reduce((s, e) => s + e.totalN, 0)
  const totalN1 = [...map.values()].reduce((s, e) => s + e.totalN1, 0)
  const totalBudget = [...map.values()].reduce((s, e) => s + e.budget, 0)

  const toLigne = (acc: string, e: typeof map extends Map<string, infer V> ? V : never): CompteLigne => ({
    account: acc,
    label: e.label || acc,
    totalN: e.totalN,
    totalN1: e.totalN1,
    budget: e.budget,
    frequency: e.freq,
    avgAmount: e.freq > 0 ? e.totalN / e.freq : 0,
    sharePct: totalN !== 0 ? (e.totalN / totalN) * 100 : 0,
    varN1Pct: pctVar(e.totalN, e.totalN1),
    varBudgetPct: pctVar(e.totalN, e.budget),
  })

  const detail = [...map.entries()]
    .map(([acc, e]) => toLigne(acc, e))
    .filter(l => Math.abs(l.totalN) > 0.5 || Math.abs(l.totalN1) > 0.5)
    .sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))

  // Familles = regroupement par préfixe 2 chiffres
  const famMap = new Map<string, { totalN: number; totalN1: number; budget: number; freq: number; label: string }>()
  for (const [acc, e] of map.entries()) {
    const fam = acc.slice(0, 2)
    const f = famMap.get(fam) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: '' }
    f.totalN += e.totalN; f.totalN1 += e.totalN1; f.budget += e.budget; f.freq += e.freq
    famMap.set(fam, f)
  }
  const familles = [...famMap.entries()]
    .map(([fam, e]) => toLigne(fam, e))
    .filter(l => Math.abs(l.totalN) > 0.5 || Math.abs(l.totalN1) > 0.5)
    .sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))

  return { detail, familles, totalN, totalN1, totalBudget }
}

/** Immobilisations & amortissements depuis le bilan (classe 2). */
function aggregateBilan(
  companies: CompanyRaw[],
  predicate: (acc: string) => boolean,
): CompteLigne[] {
  const map = new Map<string, { totalN: number; totalN1: number; freq: number; label: string }>()
  const add = (src: Record<string, BilanAccount>, field: 'totalN' | 'totalN1') => {
    for (const [acc, ba] of Object.entries(src)) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, freq: 0, label: ba.l }
      e[field] += ba.s
      if (field === 'totalN') e.freq += ba.e?.length ?? 0
      if (!e.label) e.label = ba.l
      map.set(acc, e)
    }
  }
  for (const co of companies) { add(co.bn ?? {}, 'totalN'); add(co.b1 ?? {}, 'totalN1') }

  const totalN = [...map.values()].reduce((s, e) => s + e.totalN, 0)
  return [...map.entries()]
    .map(([acc, e]) => ({
      account: acc,
      label: e.label || acc,
      totalN: e.totalN,
      totalN1: e.totalN1,
      budget: 0,
      frequency: e.freq,
      avgAmount: e.freq > 0 ? e.totalN / e.freq : 0,
      sharePct: totalN !== 0 ? (e.totalN / totalN) * 100 : 0,
      varN1Pct: pctVar(e.totalN, e.totalN1),
      varBudgetPct: null,
    }))
    .filter(l => Math.abs(l.totalN) > 0.5 || Math.abs(l.totalN1) > 0.5)
    .sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRapportData(): RapportData | null {
  const RAW            = useAppStore(s => s.RAW)
  const manualEntries  = useAppStore(s => s.manualEntries)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)
  const filters        = useAppStore(s => s.filters)

  return useMemo(() => {
    if (!RAW || RAW.keys.length === 0) return null

    const selCo = (filters.selCo && filters.selCo.length > 0) ? filters.selCo : RAW.keys
    const companyKeys = selCo.filter(k => RAW.companies[k])
    if (!companyKeys.length) return null
    const companies = companyKeys.map(k => RAW.companies[k])

    // Exercice de référence = exercice courant de la 1ère société sélectionnée
    const startMonth = fiscalSettings[companyKeys[0]] ?? 1
    const exerciceN  = currentFiscalYear(startMonth)
    const exerciceN1 = exerciceN - 1

    // ── Période de comparaison « à même période » ─────────────────────────
    // N est souvent incomplet (ex : jan→avr). On restreint N-1 et le budget aux
    // mêmes mois pour une comparaison juste (sinon 4 mois de N vs 12 mois de N-1).
    const monthsN = (RAW.mn ?? []).filter(m =>
      companyKeys.some(k => fiscalYearOf(m, fiscalSettings[k] ?? startMonth) === exerciceN))
    const monthsMM = new Set(monthsN.map(m => m.slice(5, 7)))
    const budgetIdx = new Set(monthsN.map(m => fiscalMonthIndex(m, startMonth)))
    // Garde-fou : si on ne détecte aucun mois (données atypiques), pas de restriction.
    const safeMM = monthsMM.size > 0 ? monthsMM : new Set(Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')))
    const safeIdx = budgetIdx.size > 0 ? budgetIdx : new Set(Array.from({length:12},(_,i)=>i))
    const periodeComplete = safeMM.size >= 12

    // ── P&L : produits / charges ──────────────────────────────────────────
    const prod    = aggregateAccounts(companies, isProduit, false, safeMM, safeIdx)
    const charges = aggregateAccounts(companies, isCharge, true, safeMM, safeIdx)

    // ── Bilan : immobilisations (20/21/23, hors 28) & amortissements ──────
    const immobilisations = aggregateBilan(companies, acc =>
      acc.startsWith('2') && !acc.startsWith('28'))
    // Amortissements : cumul bilan 28x + dotations P&L 68x
    const amortBilan = aggregateBilan(companies, acc => acc.startsWith('28'))
    const amortPL    = aggregateAccounts(companies, acc => acc.startsWith('68'), true, safeMM, safeIdx).detail
    const amortissements = [...amortBilan, ...amortPL]
      .sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))

    const resultatN  = prod.totalN  - charges.totalN
    const resultatN1 = prod.totalN1 - charges.totalN1

    // ── Tiers nominatifs : FEC (cdN clients + comptes auxiliaires bilan) + saisies ──
    // Normalisation des noms pour fusionner FEC et saisies sur le même tiers.
    const normName = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ')

    // Carte de résolution des noms via le bilan FEC (comptes auxiliaires 411xxx / 401xxx)
    const fecNames = new Map<string, string>()
    for (const co of companies) {
      for (const src of [co.bn ?? {}, co.b1 ?? {}]) {
        for (const [acc, ba] of Object.entries(src)) {
          if ((acc.startsWith('411') || acc.startsWith('401')) && ba.l && !fecNames.has(acc)) {
            fecNames.set(acc, ba.l)
          }
        }
      }
    }
    const resolveName = (e: ManualEntry): string =>
      e.counterpart?.trim() ||
      (e.account_num ? fecNames.get(e.account_num) : undefined) ||
      e.label?.trim() ||
      'Tiers non identifié'

    const meN = manualEntries.filter(e =>
      companyKeys.includes(e.company_key) &&
      fiscalYearOf(e.entry_date.slice(0, 7), fiscalSettings[e.company_key] ?? startMonth) === exerciceN
    )

    interface TiersAccu {
      name: string; totalN: number; totalN1: number; nb: number
      delais: number[]; impayes: number; fromFec: boolean; fromSaisie: boolean
    }

    // Extraction du nom de tiers depuis le libellé d'une écriture du compte collectif.
    const extractClientName = (label: string): string | null => {
      const m = /CLIENT\s+(.+?)\s*$/i.exec(label)   // "FACT MC001 - CLIENT DELPHI" → DELPHI
      return m ? m[1].trim() : null
    }
    const extractFournName = (label: string): string | null => {
      // Lignes collectives à ignorer (paiements groupés, à-nouveaux, encaissements)
      if (/^\s*(PAIEMENTS?\s+FOURNISSEURS|REPORT\s+A\s+NOUVEAU|ENCAISSEMENT)/i.test(label)) return null
      const s = label.trim()
        .replace(/\s+\d{2}\/\d{4}\s*$/, '')   // retire un suffixe de période "01/2026"
        .replace(/^ACHAT\s+/i, '')             // retire le préfixe "ACHAT "
      return s.length >= 2 ? s : null
    }

    /** Graines FEC : cdN clients + comptes auxiliaires bilan + parsing des écritures des comptes collectifs 411/401. */
    function fecSeeds(kind: 'client' | 'fournisseur'): TiersAccu[] {
      const seeds = new Map<string, TiersAccu>()
      const add = (rawName: string, totalN: number, totalN1: number, nb: number) => {
        const key = normName(rawName)
        if (!key || Math.abs(totalN) + Math.abs(totalN1) < 0.5) return
        const s = seeds.get(key) ?? { name: rawName.trim(), totalN: 0, totalN1: 0, nb: 0, delais: [], impayes: 0, fromFec: true, fromSaisie: false }
        s.totalN += totalN; s.totalN1 += totalN1; s.nb += nb
        seeds.set(key, s)
      }
      const addField = (rawName: string, amount: number, field: 'totalN' | 'totalN1', nb: number) =>
        field === 'totalN' ? add(rawName, amount, 0, nb) : add(rawName, 0, amount, nb)

      const prefix = kind === 'client' ? '411' : '401'
      const extract = kind === 'client' ? extractClientName : extractFournName

      for (const co of companies) {
        const hasCd = kind === 'client' && Object.keys(co.cdN ?? {}).length > 0
        if (kind === 'client' && hasCd) {
          for (const info of Object.values(co.cdN ?? {})) add(info.n || '', info.ca || 0, 0, info.entries || 0)
          for (const info of Object.values(co.cdN1 ?? {})) {
            const key = normName(info.n || '')
            const ex = seeds.get(key)
            if (ex) ex.totalN1 += info.ca || 0
            else add(info.n || '', 0, info.ca || 0, 0)
          }
        }
        // Parsing des écritures des comptes 411/401 (collectif ou auxiliaire).
        // Le nom du tiers est dans le libellé de la facture (débit pour client, crédit pour fournisseur).
        const parse = (src: Record<string, BilanAccount>, field: 'totalN' | 'totalN1') => {
          for (const [acc, ba] of Object.entries(src)) {
            if (!acc.startsWith(prefix)) continue
            if (kind === 'client' && hasCd) continue   // déjà couvert par cdN → éviter le doublon
            if (ba.e && ba.e.length) {
              for (const e of ba.e) {
                const date = (e[0] as string) || ''
                // N-1 : ne garder que les mois de la période de comparaison (même période).
                if (field === 'totalN1' && date && !safeMM.has(date.slice(5, 7))) continue
                const label = (e[1] as string) || ''
                const amount = kind === 'client' ? (e[2] as number) : (e[3] as number)  // débit / crédit
                if (!(amount > 0)) continue
                const name = extract(label)
                if (name) addField(name, amount, field, 1)
              }
            } else if (acc.length > 3 && ba.l) {
              // Compte auxiliaire sans écritures détaillées → solde
              addField(ba.l, Math.abs(ba.s), field, 0)
            }
          }
        }
        parse(co.bn ?? {}, 'totalN'); parse(co.b1 ?? {}, 'totalN1')
      }
      return [...seeds.values()]
    }

    function buildTiers(
      cats: ManualEntry['category'][],
      kind: 'client' | 'fournisseur',
    ): { tiers: TiersDelai[]; globalDelai: number | null } {
      // 1) Graines FEC
      const map = new Map<string, TiersAccu>()
      for (const seed of fecSeeds(kind)) map.set(normName(seed.name), seed)

      // 2) Fusion des saisies (apportent les délais de paiement)
      for (const e of meN.filter(e => cats.includes(e.category))) {
        const rawName = resolveName(e)
        const key = normName(rawName)
        const r = map.get(key) ?? { name: rawName, totalN: 0, totalN1: 0, nb: 0, delais: [], impayes: 0, fromFec: false, fromSaisie: false }
        r.totalN += parseFloat(e.amount_ht ?? e.amount_ttc ?? '0') || 0
        r.nb += 1
        r.fromSaisie = true
        if (e.payment_date) r.delais.push(daysBetween(e.entry_date, e.payment_date))
        else if (e.payment_mode !== 'comptant') r.impayes += 1
        map.set(key, r)
      }

      const total = [...map.values()].reduce((s, r) => s + r.totalN, 0)
      // Base de calcul du délai = tiers AYANT un délai connu (les délais ne viennent
      // que des saisies ; les tiers FEC sans paiement nominatif n'y participent pas).
      const delaiBase = [...map.values()]
        .filter(r => (r.delais ?? []).length).reduce((s, r) => s + r.totalN, 0)

      const tiers: TiersDelai[] = [...map.values()]
        .map(r => {
          const dl = r.delais ?? []
          const delaiMoyen = dl.length ? dl.reduce((a, b) => a + b, 0) / dl.length : null
          const sharePct = total !== 0 ? (r.totalN / total) * 100 : 0
          // Contribution pondérée au délai global, calculée parmi les tiers à délai connu.
          const contributionDelai = (delaiMoyen != null && delaiBase > 0)
            ? (r.totalN / delaiBase) * delaiMoyen : null
          return {
            name: r.name,
            totalN: r.totalN,
            nbFactures: r.nb,
            delaiMoyen,
            sharePct,
            contributionDelai,
            nbImpayes: r.impayes,
            source: (r.fromFec && r.fromSaisie ? 'FEC+saisie' : r.fromFec ? 'FEC' : 'saisie') as TiersDelai['source'],
          }
        })
        .filter(t => Math.abs(t.totalN) > 0.5)
        .sort((a, b) => b.totalN - a.totalN)
      // Délai global = moyenne pondérée = somme des contributions (sur la base à délai connu)
      const contribs = tiers.filter(t => t.contributionDelai != null)
      const globalDelai = contribs.length
        ? contribs.reduce((s, t) => s + (t.contributionDelai ?? 0), 0)
        : null
      return { tiers, globalDelai }
    }

    const clientsRes = buildTiers(['Vente'], 'client')
    const fournRes   = buildTiers(['Achat', 'Depense'], 'fournisseur')

    return {
      exerciceN,
      exerciceN1,
      companyKeys,
      nbMois: safeMM.size,
      periodeComplete,
      produitsFamilles: prod.familles,
      produitsDetail: prod.detail.slice(0, 25),
      totalProduitsN: prod.totalN,
      totalProduitsN1: prod.totalN1,
      totalProduitsBudget: prod.totalBudget,
      chargesFamilles: charges.familles,
      chargesDetail: charges.detail.slice(0, 25),
      totalChargesN: charges.totalN,
      totalChargesN1: charges.totalN1,
      totalChargesBudget: charges.totalBudget,
      immobilisations: immobilisations.slice(0, 15),
      amortissements: amortissements.slice(0, 15),
      resultatN,
      resultatN1,
      clients: clientsRes.tiers.slice(0, 20),
      fournisseurs: fournRes.tiers.slice(0, 20),
      delaiMoyenClientGlobal: clientsRes.globalDelai,
      delaiMoyenFournGlobal: fournRes.globalDelai,
    }
  }, [RAW, manualEntries, fiscalSettings, filters.selCo])
}
