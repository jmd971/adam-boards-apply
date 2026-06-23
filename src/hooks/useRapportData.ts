import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fiscalYearOf, currentFiscalYear } from '@/lib/calc'
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
}

export interface RapportData {
  exerciceN: number
  exerciceN1: number
  companyKeys: string[]

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

/** Solde net d'un compte FEC sur tout l'exercice (charge: débit-crédit, produit: crédit-débit). */
function soldeFec(fa: FecAccount, charge: boolean): number {
  let d = 0, c = 0
  for (const [deb, cred] of Object.values(fa.mo)) { d += deb; c += cred }
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
): { detail: CompteLigne[]; familles: CompteLigne[]; totalN: number; totalN1: number; totalBudget: number } {
  // acc -> { totalN, totalN1, budget, freq, label }
  const map = new Map<string, { totalN: number; totalN1: number; budget: number; freq: number; label: string }>()

  for (const co of companies) {
    // N
    for (const [acc, fa] of Object.entries(co.pn)) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: fa.l }
      e.totalN += soldeFec(fa, charge)
      e.freq   += fa.e?.length ?? 0
      if (!e.label) e.label = fa.l
      map.set(acc, e)
    }
    // N-1
    for (const [acc, fa] of Object.entries(co.p1)) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: fa.l }
      e.totalN1 += soldeFec(fa, charge)
      if (!e.label) e.label = fa.l
      map.set(acc, e)
    }
    // Budget (somme des 12 mois)
    for (const [acc, ba] of Object.entries(co.bud ?? {})) {
      if (!predicate(acc)) continue
      const e = map.get(acc) ?? { totalN: 0, totalN1: 0, budget: 0, freq: 0, label: ba.l }
      e.budget += (ba.b ?? []).reduce((s, v) => s + v, 0)
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
  for (const co of companies) { add(co.bn, 'totalN'); add(co.b1, 'totalN1') }

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

    // ── P&L : produits / charges ──────────────────────────────────────────
    const prod    = aggregateAccounts(companies, isProduit, false)
    const charges = aggregateAccounts(companies, isCharge, true)

    // ── Bilan : immobilisations (20/21/23, hors 28) & amortissements ──────
    const immobilisations = aggregateBilan(companies, acc =>
      acc.startsWith('2') && !acc.startsWith('28'))
    // Amortissements : cumul bilan 28x + dotations P&L 68x
    const amortBilan = aggregateBilan(companies, acc => acc.startsWith('28'))
    const amortPL    = aggregateAccounts(companies, acc => acc.startsWith('68'), true).detail
    const amortissements = [...amortBilan, ...amortPL]
      .sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))

    const resultatN  = prod.totalN  - charges.totalN
    const resultatN1 = prod.totalN1 - charges.totalN1

    // ── Tiers nominatifs + délais (depuis manual_entries, exercice N) ──────
    // Carte de résolution des noms via le bilan FEC (411 clients / 401 fournisseurs)
    const fecNames = new Map<string, string>()
    for (const co of companies) {
      for (const src of [co.bn, co.b1]) {
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

    function buildTiers(cats: ManualEntry['category'][]): { tiers: TiersDelai[]; globalDelai: number | null } {
      const sub = meN.filter(e => cats.includes(e.category))
      const map = new Map<string, { totalN: number; nb: number; delais: number[]; impayes: number }>()
      for (const e of sub) {
        const name = resolveName(e)
        const r = map.get(name) ?? { totalN: 0, nb: 0, delais: [], impayes: 0 }
        r.totalN += parseFloat(e.amount_ht ?? e.amount_ttc ?? '0') || 0
        r.nb += 1
        if (e.payment_date) r.delais.push(daysBetween(e.entry_date, e.payment_date))
        else if (e.payment_mode !== 'comptant') r.impayes += 1
        map.set(name, r)
      }
      const total = [...map.values()].reduce((s, r) => s + r.totalN, 0)
      const tiers: TiersDelai[] = [...map.entries()]
        .map(([name, r]) => {
          const delaiMoyen = r.delais.length ? r.delais.reduce((a, b) => a + b, 0) / r.delais.length : null
          const sharePct = total !== 0 ? (r.totalN / total) * 100 : 0
          return {
            name,
            totalN: r.totalN,
            nbFactures: r.nb,
            delaiMoyen,
            sharePct,
            contributionDelai: delaiMoyen != null ? (sharePct / 100) * delaiMoyen : null,
            nbImpayes: r.impayes,
          }
        })
        .sort((a, b) => b.totalN - a.totalN)
      // Délai global = moyenne pondérée = somme des contributions
      const contribs = tiers.filter(t => t.contributionDelai != null)
      const globalDelai = contribs.length
        ? contribs.reduce((s, t) => s + (t.contributionDelai ?? 0), 0)
        : null
      return { tiers, globalDelai }
    }

    const clientsRes = buildTiers(['Vente'])
    const fournRes   = buildTiers(['Achat', 'Depense'])

    return {
      exerciceN,
      exerciceN1,
      companyKeys,
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
