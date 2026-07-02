import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { isODAccount, fiscalYearOf, currentFiscalYear, fiscalMonthIndex } from '@/lib/calc'
import type { RAWData, FecAccount } from '@/types'

// ── Données du Thème 1 « Le résultat, en clair » ─────────────────────────────
// Brique dédiée, indépendante de useRapportData (qui, lui, n'applique PAS le
// hors OD). Règles figées : compte de résultat uniquement, HORS OD systématique,
// période calée sur l'exercice fiscal, N vs même période N-1 vs budget (version
// active déjà appliquée en amont dans RAW). Les flux intra-groupe sont CONSERVÉS
// dans le résultat mais ISOLÉS pour analyse séparée.

/** Une grande masse (famille 2 chiffres) ou un compte : montants positifs. */
export interface MasseLigne {
  key: string
  label: string
  totalN: number
  totalN1: number
  budget: number
  varN1Pct: number | null
  varBudgetPct: number | null
}

/** Un flux intra-groupe détecté (gardé dans le résultat, isolé pour analyse). */
export interface IntraGroupFlow {
  company: string
  entity: string                 // entité du groupe reconnue dans le libellé
  account: string
  label: string
  sens: 'charge' | 'produit'
  montantN: number               // magnitude positive
  montantN1: number
}

/** Un point de la série mensuelle (annexe dépliable). */
export interface MonthPoint {
  month: string                  // 'YYYY-MM' (mois de N)
  resultatN: number
  resultatN1: number             // même mois calendaire dans N-1
  budget: number | null
}

export interface ResultatTheme {
  companyKeys: string[]
  exerciceN: number
  exerciceN1: number
  nbMois: number
  periodeComplete: boolean
  hasBudget: boolean
  // Résultat (hors OD)
  resultatN: number
  resultatN1: number
  resultatBudget: number
  // Grandes masses (hors OD)
  produitsN: number; produitsN1: number; produitsBudget: number
  chargesN: number; chargesN1: number; chargesBudget: number
  produitsMasses: MasseLigne[]
  chargesMasses: MasseLigne[]
  topMovers: MasseLigne[]        // comptes au plus fort écart N vs N-1 (contribution résultat)
  // Annexe + intra-groupe
  monthly: MonthPoint[]
  intraGroup: IntraGroupFlow[]
  intraGroupChargesN: number
  intraGroupProduitsN: number
}

const isCharge  = (a: string) => a.startsWith('6')
const isProduit = (a: string) => a.startsWith('7')
const pctVar = (n: number, ref: number): number | null => ref !== 0 ? ((n - ref) / Math.abs(ref)) * 100 : null
const normLabel = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** crédit − débit d'un compte, filtré soit par mois exacts (N) soit par n° de mois MM (N-1). */
function creditMinusDebit(fa: FecAccount, exact?: Set<string>, mm?: Set<string>): number {
  let d = 0, c = 0
  for (const [m, v] of Object.entries(fa.mo ?? {})) {
    if (exact && !exact.has(m)) continue
    if (mm && !mm.has(m.slice(5, 7))) continue
    d += v[0]; c += v[1]
  }
  return c - d
}

export interface Theme1Opts { cutoffMonth?: string; today?: Date }

/**
 * Construit les données du Thème 1 (pure, testable).
 * @param groupEntities noms des entités du groupe (pour isoler l'intra-groupe).
 */
export function buildResultatTheme(
  RAW: RAWData | null,
  fiscalSettings: Record<string, number>,
  selCo: string[],
  groupEntities: string[] = [],
  opts: Theme1Opts = {},
): ResultatTheme | null {
  if (!RAW || RAW.keys.length === 0) return null
  const keys0 = (selCo && selCo.length) ? selCo : RAW.keys
  const companyKeys = keys0.filter(k => RAW.companies[k])
  if (!companyKeys.length) return null

  const startMonth = fiscalSettings[companyKeys[0]] ?? 1
  const exerciceN  = currentFiscalYear(startMonth, opts.today ?? new Date())
  const exerciceN1 = exerciceN - 1

  // Période N calée sur l'exercice fiscal (avec cutoff optionnel pour le groupe).
  let monthsN = (RAW.mn ?? []).filter(m =>
    companyKeys.some(k => fiscalYearOf(m, fiscalSettings[k] ?? startMonth) === exerciceN))
  if (opts.cutoffMonth) monthsN = monthsN.filter(m => m <= opts.cutoffMonth!)
  monthsN = [...new Set(monthsN)].sort()
  const monthsNSet = new Set(monthsN)
  const mmSet = new Set(monthsN.map(m => m.slice(5, 7)))
  const safeMM = mmSet.size ? mmSet : new Set(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')))
  const periodeComplete = safeMM.size >= 12
  const entities = groupEntities.map(normLabel).filter(Boolean)

  // ── Agrégation par compte (hors OD) ──────────────────────────────────────
  interface Acc { label: string; sN: number; sN1: number; budget: number }  // s = crédit−débit (contribution résultat)
  const accMap = new Map<string, Acc>()
  let hasBudget = false
  const intraGroup: IntraGroupFlow[] = []

  companyKeys.forEach(k => {
    const co = RAW.companies[k]
    const sm = fiscalSettings[k] ?? startMonth
    const idxSet = new Set(monthsN.map(m => fiscalMonthIndex(m, sm)))
    const selfName = normLabel(co.name || k)

    const touch = (acc: string, fa: FecAccount): Acc => {
      const e = accMap.get(acc) ?? { label: fa.l, sN: 0, sN1: 0, budget: 0 }
      if (!e.label) e.label = fa.l
      accMap.set(acc, e)
      return e
    }

    for (const [acc, fa] of Object.entries(co.pn ?? {})) {
      if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
      touch(acc, fa).sN += creditMinusDebit(fa, monthsNSet)
    }
    for (const [acc, fa] of Object.entries(co.p1 ?? {})) {
      if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
      touch(acc, fa).sN1 += creditMinusDebit(fa, undefined, safeMM)
    }
    for (const [acc, ba] of Object.entries(co.bud ?? {})) {
      if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
      const b = (ba.b ?? []).reduce((s, v, i) => idxSet.has(i) ? s + v : s, 0)
      if (b !== 0) hasBudget = true
      // budget stocké positif ; contribution résultat = +produit / −charge
      touch(acc, { l: ba.l, mo: {}, e: [] } as FecAccount).budget += isProduit(acc) ? b : -b
    }

    // ── Détection intra-groupe (libellé du compte contient une entité du groupe) ──
    for (const [acc, fa] of Object.entries(co.pn ?? {})) {
      if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
      const lab = normLabel(fa.l)
      const ent = entities.find(e => e !== selfName && lab.includes(e))
      if (!ent) continue
      const sN  = creditMinusDebit(fa, monthsNSet)
      const faN1 = co.p1?.[acc]
      const sN1 = faN1 ? creditMinusDebit(faN1, undefined, safeMM) : 0
      const sens: 'charge' | 'produit' = isCharge(acc) ? 'charge' : 'produit'
      intraGroup.push({
        company: co.name || k, entity: ent, account: acc, label: fa.l, sens,
        montantN:  Math.abs(sN), montantN1: Math.abs(sN1),
      })
    }
  })

  // ── Totaux (hors OD) ─────────────────────────────────────────────────────
  let produitsN = 0, produitsN1 = 0, produitsBudget = 0
  let chargesN = 0, chargesN1 = 0, chargesBudget = 0
  for (const [acc, e] of accMap) {
    if (isProduit(acc)) { produitsN += e.sN; produitsN1 += e.sN1; produitsBudget += e.budget }
    else { chargesN += -e.sN; chargesN1 += -e.sN1; chargesBudget += -e.budget }  // magnitude positive
  }
  const resultatN      = produitsN - chargesN
  const resultatN1     = produitsN1 - chargesN1
  const resultatBudget = produitsBudget - chargesBudget

  // ── Grandes masses (familles 2 chiffres) ─────────────────────────────────
  const famMap = new Map<string, { label: string; totalN: number; totalN1: number; budget: number; charge: boolean }>()
  for (const [acc, e] of accMap) {
    const fam = acc.slice(0, 2)
    const charge = isCharge(acc)
    const f = famMap.get(fam) ?? { label: '', totalN: 0, totalN1: 0, budget: 0, charge }
    const sign = charge ? -1 : 1   // charges en magnitude positive
    f.totalN += sign * e.sN; f.totalN1 += sign * e.sN1; f.budget += sign * e.budget
    famMap.set(fam, f)
  }
  const toMasse = (key: string, f: { label: string; totalN: number; totalN1: number; budget: number }): MasseLigne => ({
    key, label: f.label || key, totalN: f.totalN, totalN1: f.totalN1, budget: f.budget,
    varN1Pct: pctVar(f.totalN, f.totalN1), varBudgetPct: pctVar(f.totalN, f.budget),
  })
  const masses = [...famMap.entries()]
    .filter(([, f]) => Math.abs(f.totalN) > 0.5 || Math.abs(f.totalN1) > 0.5)
  const produitsMasses = masses.filter(([, f]) => !f.charge).map(([k, f]) => toMasse(k, f)).sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))
  const chargesMasses  = masses.filter(([, f]) =>  f.charge).map(([k, f]) => toMasse(k, f)).sort((a, b) => Math.abs(b.totalN) - Math.abs(a.totalN))

  // ── Top movers (plus fort écart N vs N-1, en contribution résultat) ──────
  const topMovers = [...accMap.entries()]
    .map(([acc, e]) => toMasse(acc, { label: e.label, totalN: e.sN, totalN1: e.sN1, budget: e.budget }))
    .filter(l => Math.abs(l.totalN - l.totalN1) > 0.5)
    .sort((a, b) => Math.abs(b.totalN - b.totalN1) - Math.abs(a.totalN - a.totalN1))
    .slice(0, 10)

  // ── Série mensuelle (annexe) ─────────────────────────────────────────────
  const monthly: MonthPoint[] = monthsN.map(m => {
    const mm = m.slice(5, 7)
    let rN = 0, rN1 = 0, bud = 0
    companyKeys.forEach(k => {
      const co = RAW.companies[k]
      const sm = fiscalSettings[k] ?? startMonth
      const idx = fiscalMonthIndex(m, sm)
      for (const [acc, fa] of Object.entries(co.pn ?? {})) {
        if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
        rN += creditMinusDebit(fa, new Set([m]))
      }
      for (const [acc, fa] of Object.entries(co.p1 ?? {})) {
        if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
        rN1 += creditMinusDebit(fa, undefined, new Set([mm]))
      }
      for (const [acc, ba] of Object.entries(co.bud ?? {})) {
        if (!(isCharge(acc) || isProduit(acc)) || isODAccount(acc)) continue
        const v = (ba.b ?? [])[idx] ?? 0
        bud += isProduit(acc) ? v : -v
      }
    })
    return { month: m, resultatN: rN, resultatN1: rN1, budget: hasBudget ? bud : null }
  })

  const intraGroupChargesN  = intraGroup.filter(f => f.sens === 'charge').reduce((s, f) => s + f.montantN, 0)
  const intraGroupProduitsN = intraGroup.filter(f => f.sens === 'produit').reduce((s, f) => s + f.montantN, 0)

  return {
    companyKeys, exerciceN, exerciceN1, nbMois: safeMM.size, periodeComplete, hasBudget,
    resultatN, resultatN1, resultatBudget,
    produitsN, produitsN1, produitsBudget, chargesN, chargesN1, chargesBudget,
    produitsMasses, chargesMasses, topMovers, monthly,
    intraGroup: intraGroup.sort((a, b) => b.montantN - a.montantN),
    intraGroupChargesN, intraGroupProduitsN,
  }
}

/** Hook : Thème 1 pour la sélection courante. `groupEntities` sert à isoler l'intra-groupe. */
export function useResultatTheme(groupEntities: string[] = [], opts: Theme1Opts = {}): ResultatTheme | null {
  const RAW            = useAppStore(s => s.RAW)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)
  const filters        = useAppStore(s => s.filters)
  return useMemo(
    () => buildResultatTheme(RAW, fiscalSettings, filters.selCo ?? [], groupEntities, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [RAW, fiscalSettings, filters.selCo, groupEntities.join('|'), opts.cutoffMonth],
  )
}
