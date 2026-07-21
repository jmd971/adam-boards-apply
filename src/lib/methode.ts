// ── Méthode AdamBoards — moteur déterministe du rapport mensuel ──────────────
// Spécification : docs/METHODE_ADAMBOARDS_V1.md (d'après la méthode d'analyse
// de Ghassan, entretien du 14/07/2026).
//
// Principe : on n'explique pas une variation par un commentaire, on l'explique
// par les écritures. Pipeline : cadrage (résultat net) → apprentissage des
// patterns récurrents sur N-1 (compte × tiers × fréquence × montant) →
// attendus → confrontation N (conforme / manquant / montant anormal / nouveau)
// → décomposition mécanique de la variation de chaque compte.
//
// Ce module est 100 % déterministe (pas d'IA) : l'IA n'intervient qu'en
// restitution (edge function generate-methode-rapport) et ne recalcule rien.
//
// Résolution du tiers — chaîne de repli (tout depuis la base, pas de FEC brut) :
//   1. contrepartie : jointure (pièce, date) avec les sous-comptes 401x/411x
//      du bilan (l'approche « contrepartie » de la méthode)
//   2. motif de libellé : « … - CLIENT X » ou préfixe avant « / »
//   3. regroupement par premiers mots significatifs du libellé
//   4. sans tiers (pattern sur compte seul, confiance dégradée)

import { isODAccount, fiscalYearOf, currentFiscalYear } from '@/lib/calc'
import type { RAWData, FecAccount, FecEntry, BilanAccount } from '@/types'

// ── Paramètres (seuils combinés absolu ET relatif — jamais purement relatifs) ─

export interface MethodeParams {
  absMatch: number    // € — tolérance de rapprochement (plancher absolu)
  relMatch: number    // ratio — tolérance de rapprochement relative
  absSignif: number   // € — écart signalé seulement au-delà de ce plancher…
  relSignif: number   // ratio — …ET au-delà de ce % de la base
}

export const DEFAULT_METHODE_PARAMS: MethodeParams = {
  absMatch: 20, relMatch: 0.10, absSignif: 500, relSignif: 0.05,
}

// ── Types de sortie ──────────────────────────────────────────────────────────

/** 1 = contrepartie bilan (sûr) · 2 = motif libellé · 3 = regroupement · 4 = aucun */
export type TiersConfidence = 1 | 2 | 3 | 4

export type FreqLabel = 'mensuel' | 'bimestriel' | 'trimestriel' | 'semestriel' | 'annuel' | 'irregulier'

export type Verdict = 'conforme' | 'manquant' | 'montant_anormal' | 'nouveau'

export interface EcritureRef {
  date: string
  label: string
  amount: number   // solde métier de la ligne (charge : D−C, produit : C−D)
  piece: string
}

/** Un pattern (compte × tiers) confronté à ses attendus. */
export interface GroupeAnalyse {
  compte: string
  tiers: string              // '' si non identifié
  conf: TiersConfidence
  freq: FreqLabel            // apprise sur l'exercice N-1 complet
  montantMedian: number      // montant médian d'une occurrence (N-1)
  nN1: number                // occurrences N-1, même période
  totalN1: number
  nN: number                 // occurrences N
  totalN: number
  ecart: number              // totalN − totalN1 (contribution exacte à la variation)
  verdict: Verdict | null    // null si pas d'historique N-1 (histoLimite)
  significatif: boolean
  entriesN: EcritureRef[]
  entriesN1: EcritureRef[]
}

export interface CompteAnalyse {
  account: string
  label: string
  charge: boolean
  isOD: boolean              // compte d'inventaire/clôture : pas d'attendus
  totalN: number             // magnitude sens métier (positif)
  totalN1: number            // même période
  variation: number          // totalN − totalN1
  // Décomposition mécanique : variation = manquants + nouveaux + ecartsMontant + residuel
  manquants: number
  nouveaux: number
  ecartsMontant: number
  residuel: number
  groupes: GroupeAnalyse[]
}

export interface FamilleAnalyse {
  key: string                // préfixe 2 chiffres
  label: string
  charge: boolean
  totalN: number
  totalN1: number
  variation: number
  comptes: CompteAnalyse[]
}

export interface QuestionComptable {
  compte: string
  compteLabel: string
  tiers: string
  verdict: Verdict
  ecart: number
  constat: string            // texte déterministe — l'IA peut reformuler, jamais recalculer
  question: string
}

export interface RecoSaisie {
  compte: string
  compteLabel: string
  motif: string
}

export interface MethodeRapport {
  companyKey: string
  companyLabel: string
  exerciceN: number
  exerciceN1: number
  monthsN: string[]
  nbMois: number
  periodeComplete: boolean
  histoLimite: boolean       // true : pas d'écritures N-1 → pas de verdicts
  // ── Étape 1 : cadrage (résultat net, 3 grandeurs) ──
  caN: number
  caN1: number
  resultatN: number
  resultatN1: number
  variation: number          // €
  variationPct: number | null
  resPctCaN: number | null   // résultat en % du CA
  resPctCaN1: number | null
  pointsCa: number | null    // écart en points de % du CA
  totalProduitsN: number
  totalProduitsN1: number
  totalChargesN: number
  totalChargesN1: number
  // ── Niveaux 1-3 ──
  produits: FamilleAnalyse[]
  charges: FamilleAnalyse[]
  // ── Annexes ──
  questions: QuestionComptable[]     // A — questions au comptable
  recos: RecoSaisie[]                // B — recommandations de saisie
  params: MethodeParams
}

// ── Libellés des familles (PCG, 2 chiffres) ──────────────────────────────────

const FAMILLE_LABELS: Record<string, string> = {
  '60': 'Achats', '61': 'Services extérieurs', '62': 'Autres services extérieurs',
  '63': 'Impôts et taxes', '64': 'Charges de personnel', '65': 'Autres charges de gestion',
  '66': 'Charges financières', '67': 'Charges exceptionnelles', '68': 'Dotations',
  '69': 'Impôt sur les bénéfices',
  '70': 'Ventes', '71': 'Production stockée', '72': 'Production immobilisée',
  '73': 'Produits nets partiels', '74': 'Subventions', '75': 'Autres produits de gestion',
  '76': 'Produits financiers', '77': 'Produits exceptionnels', '78': 'Reprises',
  '79': 'Transferts de charges',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const isCharge  = (a: string) => a.startsWith('6')
const isProduit = (a: string) => a.startsWith('7')
const pctVar = (n: number, ref: number): number | null =>
  ref !== 0 ? ((n - ref) / Math.abs(ref)) * 100 : null

const normTiers = (s: string) => (s || '')
  .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9 &'.-]/g, ' ').replace(/\s+/g, ' ').trim()

/** Mots non identifiants dans un libellé d'écriture. */
const STOP_WORDS = new Set([
  'FACT', 'FACTURE', 'FACTURES', 'FAC', 'FA', 'AVOIR', 'VIR', 'VIREMENT', 'CHQ', 'CHEQUE',
  'PRLV', 'PRELEVEMENT', 'PRELEV', 'REGLEMENT', 'REGL', 'REMISE', 'ACHAT', 'ACHATS',
  'VENTE', 'VENTES', 'DIVERS', 'REPORT', 'SOLDE', 'ACOMPTE', 'CB', 'TVA', 'DONT',
  'MOIS', 'ANNEE', 'LOYER', 'HONORAIRES', 'COTISATION', 'ABONNEMENT', 'ECHEANCE',
])

const isNumericWord = (w: string) => /^\d+$/.test(w.replace(/[.,-]/g, ''))

/** Extraction du tiers depuis le libellé (niveaux 2 et 3 de la chaîne). */
export function tiersFromLabel(rawLabel: string): { tiers: string; conf: TiersConfidence } {
  const label = normTiers(rawLabel)
  if (!label) return { tiers: '', conf: 4 }
  // Motif « … CLIENT X » / « … FOURNISSEUR X » (démo + libellés normalisés)
  const mc = /(?:CLIENT|FOURNISSEUR)\s+([A-Z0-9][A-Z0-9 &'.-]{1,40})$/.exec(label)
  if (mc) return { tiers: mc[1].trim(), conf: 2 }
  // Préfixe « TIERS/… » (convention cabinet, cas SFP : « AGRODYL/MONTAGE… »)
  const slash = rawLabel.indexOf('/')
  if (slash > 2) {
    const prefix = normTiers(rawLabel.slice(0, slash))
    const first = prefix.split(' ')[0] || ''
    if (prefix.length >= 3 && !isNumericWord(prefix) && !STOP_WORDS.has(first)) {
      return { tiers: prefix, conf: 2 }
    }
  }
  // Regroupement : premiers mots significatifs du libellé
  const words = label.split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !isNumericWord(w))
  if (words.length) return { tiers: words.slice(0, 2).join(' '), conf: 3 }
  return { tiers: '', conf: 4 }
}

/** Index de contrepartie : (pièce, date) et pièce → nom du tiers (sous-comptes 401x/411x du bilan). */
export function buildContrepartieIndex(
  bilans: Record<string, BilanAccount>[],
): { byPieceDate: Map<string, string>; byPiece: Map<string, string | null> } {
  const byPieceDate = new Map<string, string>()
  const byPiece = new Map<string, string | null>()  // null = pièce ambiguë (plusieurs tiers)
  for (const src of bilans) {
    for (const [acc, ba] of Object.entries(src)) {
      if (!/^(401|411).+/.test(acc)) continue        // sous-comptes auxiliaires uniquement
      const name = (ba.l || '').trim()
      if (!name || !ba.e?.length) continue
      for (const e of ba.e) {
        const piece = (e[4] as string) || ''
        const date = (e[0] as string) || ''
        if (!piece) continue
        if (date) {
          const k = `${piece}|${date}`
          if (!byPieceDate.has(k)) byPieceDate.set(k, name)
        }
        const prev = byPiece.get(piece)
        if (prev === undefined) byPiece.set(piece, name)
        else if (prev !== null && prev !== name) byPiece.set(piece, null)
      }
    }
  }
  return { byPieceDate, byPiece }
}

/** Résout le tiers d'une écriture P&L par la chaîne de repli complète. */
function resolveTiers(
  e: FecEntry,
  idx: { byPieceDate: Map<string, string>; byPiece: Map<string, string | null> },
): { tiers: string; conf: TiersConfidence } {
  const piece = (e[4] as string) || ''
  const date = (e[0] as string) || ''
  if (piece) {
    const hit = idx.byPieceDate.get(`${piece}|${date}`)
    if (hit) return { tiers: normTiers(hit), conf: 1 }
    const hitP = idx.byPiece.get(piece)
    if (hitP) return { tiers: normTiers(hitP), conf: 1 }
  }
  return tiersFromLabel((e[1] as string) || '')
}

// ── Occurrences et fréquence ─────────────────────────────────────────────────

interface Occurrence { date: string; total: number; entries: EcritureRef[] }

/** Regroupe les écritures en occurrences (une facture = une occurrence, via la pièce). */
function toOccurrences(entries: EcritureRef[]): Occurrence[] {
  const map = new Map<string, Occurrence>()
  for (const e of entries) {
    const k = e.piece ? `p:${e.piece}` : `d:${e.date}`
    const o = map.get(k) ?? { date: e.date, total: 0, entries: [] }
    o.total += e.amount
    o.entries.push(e)
    if (e.date < o.date) o.date = e.date
    map.set(k, o)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

/** Fréquence apprise sur les dates d'occurrences (délai médian entre écritures). */
export function classifyFreq(dates: string[]): FreqLabel {
  const uniq = [...new Set(dates)].sort()
  if (uniq.length < 2) return 'irregulier'
  const gaps: number[] = []
  for (let i = 1; i < uniq.length; i++) gaps.push(daysBetween(uniq[i - 1], uniq[i]))
  const g = median(gaps)
  if (g >= 24 && g <= 38) return 'mensuel'
  if (g >= 45 && g <= 75) return 'bimestriel'
  if (g >= 76 && g <= 105) return 'trimestriel'
  if (g >= 150 && g <= 210) return 'semestriel'
  if (g >= 320 && g <= 410) return 'annuel'
  return 'irregulier'
}

// ── Moteur principal ─────────────────────────────────────────────────────────

export interface MethodeOpts { today?: Date; params?: Partial<MethodeParams> }

export function buildMethodeRapport(
  RAW: RAWData | null,
  fiscalSettings: Record<string, number>,
  companyKey: string,
  opts: MethodeOpts = {},
): MethodeRapport | null {
  if (!RAW || !companyKey || !RAW.companies[companyKey]) return null
  const co = RAW.companies[companyKey]
  const params: MethodeParams = { ...DEFAULT_METHODE_PARAMS, ...(opts.params ?? {}) }

  const startMonth = fiscalSettings[companyKey] ?? 1
  const exerciceN  = currentFiscalYear(startMonth, opts.today ?? new Date())
  const exerciceN1 = exerciceN - 1

  // Période N = mois de l'exercice courant présents dans les données
  const monthsN = (RAW.mn ?? [])
    .filter(m => fiscalYearOf(m, startMonth) === exerciceN)
    .filter(m => Object.values(co.pn ?? {}).some(fa => fa.mo?.[m]))
  const monthsNSet = new Set(monthsN)
  if (!monthsN.length) return null
  const mmSet = new Set(monthsN.map(m => m.slice(5, 7)))   // même période sur N-1
  const periodeComplete = mmSet.size >= 12

  // ── Résolution du tiers : index de contrepartie depuis le bilan ────────────
  const ctpIdx = buildContrepartieIndex([co.bn ?? {}, co.b1 ?? {}, co.b2 ?? {}])

  // ── Collecte des écritures par compte ─────────────────────────────────────
  interface CompteBrut {
    label: string; charge: boolean; isOD: boolean
    eN: (EcritureRef & { tiers: string; conf: TiersConfidence })[]
    eN1: (EcritureRef & { tiers: string; conf: TiersConfidence })[]      // même période
    eN1Full: (EcritureRef & { tiers: string; conf: TiersConfidence })[]  // exercice complet (apprentissage)
    moTotalN: number; moTotalN1: number   // totaux depuis mo (source de vérité des montants)
  }
  const comptes = new Map<string, CompteBrut>()
  let hasN1 = false

  const collect = (src: Record<string, FecAccount>, which: 'N' | 'N1') => {
    for (const [acc, fa] of Object.entries(src)) {
      if (!isCharge(acc) && !isProduit(acc)) continue
      const charge = isCharge(acc)
      const c = comptes.get(acc) ?? {
        label: fa.l || acc, charge, isOD: isODAccount(acc),
        eN: [], eN1: [], eN1Full: [], moTotalN: 0, moTotalN1: 0,
      }
      if (!c.label || c.label === acc) c.label = fa.l || acc
      // Totaux depuis mo (couvre aussi les écritures sans détail)
      for (const [m, v] of Object.entries(fa.mo ?? {})) {
        const solde = charge ? v[0] - v[1] : v[1] - v[0]
        if (which === 'N') { if (monthsNSet.has(m)) c.moTotalN += solde }
        else if (mmSet.has(m.slice(5, 7))) c.moTotalN1 += solde
      }
      // Écritures détaillées
      for (const e of fa.e ?? []) {
        const date = (e[0] as string) || ''
        const amount = charge ? ((e[2] as number) || 0) - ((e[3] as number) || 0)
                              : ((e[3] as number) || 0) - ((e[2] as number) || 0)
        if (!date || amount === 0) continue
        const { tiers, conf } = resolveTiers(e, ctpIdx)
        const ref = { date, label: (e[1] as string) || '', amount, piece: (e[4] as string) || '', tiers, conf }
        if (which === 'N') {
          if (monthsNSet.has(date.slice(0, 7))) c.eN.push(ref)
        } else {
          hasN1 = true
          c.eN1Full.push(ref)
          if (mmSet.has(date.slice(5, 7))) c.eN1.push(ref)
        }
      }
      comptes.set(acc, c)
    }
  }
  collect(co.pn ?? {}, 'N')
  collect(co.p1 ?? {}, 'N1')

  const histoLimite = !hasN1

  // ── Cadrage : résultat net & CA (3 grandeurs, OD inclus) ──────────────────
  let totalProduitsN = 0, totalProduitsN1 = 0, totalChargesN = 0, totalChargesN1 = 0
  let caN = 0, caN1 = 0
  for (const [acc, c] of comptes) {
    if (c.charge) { totalChargesN += c.moTotalN; totalChargesN1 += c.moTotalN1 }
    else {
      totalProduitsN += c.moTotalN; totalProduitsN1 += c.moTotalN1
      if (acc.startsWith('70')) { caN += c.moTotalN; caN1 += c.moTotalN1 }
    }
  }
  const resultatN  = totalProduitsN - totalChargesN
  const resultatN1 = totalProduitsN1 - totalChargesN1
  const resPctCaN  = caN  !== 0 ? (resultatN  / caN)  * 100 : null
  const resPctCaN1 = caN1 !== 0 ? (resultatN1 / caN1) * 100 : null
  const pointsCa = (resPctCaN != null && resPctCaN1 != null) ? resPctCaN - resPctCaN1 : null

  // ── Étapes 2-4 : patterns → attendus → verdicts, par compte ───────────────
  const tolMatch = (base: number) => Math.max(params.absMatch, params.relMatch * Math.abs(base))
  const isSignif = (ecart: number, base: number) =>
    Math.abs(ecart) >= params.absSignif && Math.abs(ecart) >= params.relSignif * Math.max(Math.abs(base), 1)

  const compteAnalyses: CompteAnalyse[] = []
  for (const [acc, c] of comptes) {
    const totalN = c.moTotalN, totalN1 = c.moTotalN1
    if (Math.abs(totalN) < 0.5 && Math.abs(totalN1) < 0.5) continue
    const variation = totalN - totalN1

    const ca: CompteAnalyse = {
      account: acc, label: c.label, charge: c.charge, isOD: c.isOD,
      totalN, totalN1, variation,
      manquants: 0, nouveaux: 0, ecartsMontant: 0, residuel: 0,
      groupes: [],
    }

    if (!c.isOD) {
      // Groupes (compte × tiers)
      const gMap = new Map<string, { conf: TiersConfidence; eN: EcritureRef[]; eN1: EcritureRef[]; eN1Full: EcritureRef[] }>()
      const push = (list: 'eN' | 'eN1' | 'eN1Full', e: EcritureRef & { tiers: string; conf: TiersConfidence }) => {
        const k = e.tiers || '∅'
        const g = gMap.get(k) ?? { conf: e.conf, eN: [], eN1: [], eN1Full: [] }
        g.conf = Math.min(g.conf, e.conf) as TiersConfidence
        g[list].push({ date: e.date, label: e.label, amount: e.amount, piece: e.piece })
        gMap.set(k, g)
      }
      c.eN.forEach(e => push('eN', e))
      c.eN1.forEach(e => push('eN1', e))
      c.eN1Full.forEach(e => push('eN1Full', e))

      for (const [tiersKey, g] of gMap) {
        const occN  = toOccurrences(g.eN)
        const occN1 = toOccurrences(g.eN1)
        const occFull = toOccurrences(g.eN1Full)
        const totN  = occN.reduce((s, o) => s + o.total, 0)
        const totN1 = occN1.reduce((s, o) => s + o.total, 0)
        if (Math.abs(totN) < 0.5 && Math.abs(totN1) < 0.5) continue
        const freq = classifyFreq(occFull.map(o => o.date))
        const montantMedian = median(occFull.length ? occFull.map(o => o.total) : occN.map(o => o.total))
        const ecart = totN - totN1

        let verdict: Verdict | null = null
        if (!histoLimite) {
          if (occN1.length === 0 && occN.length > 0) verdict = 'nouveau'
          else if (occN1.length > 0 && occN.length === 0) verdict = 'manquant'
          else if (freq !== 'irregulier' && occN.length < occN1.length && (totN1 - totN) > tolMatch(montantMedian)) verdict = 'manquant'
          else if (Math.abs(ecart) > tolMatch(totN1)) verdict = 'montant_anormal'
          else verdict = 'conforme'
        }

        const grp: GroupeAnalyse = {
          compte: acc, tiers: tiersKey === '∅' ? '' : tiersKey, conf: g.conf,
          freq, montantMedian,
          nN1: occN1.length, totalN1: totN1, nN: occN.length, totalN: totN,
          ecart, verdict,
          significatif: isSignif(ecart, totN1 || totN),
          entriesN: g.eN, entriesN1: g.eN1,
        }
        ca.groupes.push(grp)

        // Décomposition mécanique de la variation
        if (verdict === 'manquant') ca.manquants += ecart
        else if (verdict === 'nouveau') ca.nouveaux += ecart
        else if (verdict === 'montant_anormal') ca.ecartsMontant += ecart
        else ca.residuel += ecart
      }
      ca.groupes.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
      // Résiduel : ce que les écritures détaillées n'expliquent pas (écritures sans détail, arrondis)
      const sumGroupes = ca.manquants + ca.nouveaux + ca.ecartsMontant + ca.residuel
      ca.residuel += variation - sumGroupes
    } else {
      ca.residuel = variation   // comptes OD : pas d'attendus (inventaire/clôture)
    }
    compteAnalyses.push(ca)
  }

  // ── Familles (niveau 1), triées par impact décroissant ────────────────────
  const famMap = new Map<string, FamilleAnalyse>()
  for (const ca of compteAnalyses) {
    const key = ca.account.slice(0, 2)
    const f = famMap.get(key) ?? {
      key, label: FAMILLE_LABELS[key] ?? key, charge: ca.charge,
      totalN: 0, totalN1: 0, variation: 0, comptes: [],
    }
    f.totalN += ca.totalN; f.totalN1 += ca.totalN1; f.variation += ca.variation
    f.comptes.push(ca)
    famMap.set(key, f)
  }
  for (const f of famMap.values()) f.comptes.sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation))
  const byImpact = (a: FamilleAnalyse, b: FamilleAnalyse) => Math.abs(b.variation) - Math.abs(a.variation)
  const produits = [...famMap.values()].filter(f => !f.charge).sort(byImpact)
  const charges  = [...famMap.values()].filter(f =>  f.charge).sort(byImpact)

  // ── Annexe A : questions au comptable (manquants & anomalies significatifs) ─
  const questions: QuestionComptable[] = []
  for (const ca of compteAnalyses) {
    for (const g of ca.groupes) {
      if (!g.significatif || (g.verdict !== 'manquant' && g.verdict !== 'montant_anormal')) continue
      const qui = g.tiers || ca.label
      const fmtE = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €'
      const constat = g.verdict === 'manquant'
        ? `${qui} — ${ca.label} (${ca.account}) : ${g.nN1} opération(s) / ${fmtE(g.totalN1)} sur la même période ${exerciceN1}, ${g.nN ? `${g.nN} / ${fmtE(g.totalN)}` : 'rien'} en ${exerciceN} (écart ${fmtE(g.ecart)})`
        : `${qui} — ${ca.label} (${ca.account}) : montant inhabituel ${fmtE(g.totalN)} vs ${fmtE(g.totalN1)} même période ${exerciceN1} (écart ${fmtE(g.ecart)})`
      const question = g.verdict === 'manquant'
        ? (ca.charge
          ? 'Charge arrêtée, facture non reçue, ou non encore comptabilisée ?'
          : 'Contrat/abonnement terminé, prélèvement sauté, ou oubli de facturation ?')
        : 'Changement de tarif, opération exceptionnelle, ou erreur d\'imputation ?'
      questions.push({ compte: ca.account, compteLabel: ca.label, tiers: g.tiers, verdict: g.verdict, ecart: g.ecart, constat, question })
    }
  }
  questions.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))

  // ── Annexe B : recommandations de saisie (tiers non identifiables) ────────
  const recos: RecoSaisie[] = []
  for (const ca of compteAnalyses) {
    if (ca.isOD || Math.abs(ca.totalN) < params.absSignif * 2) continue
    const all = ca.groupes.flatMap(g => g.entriesN.map(e => ({ amt: Math.abs(e.amount), low: g.conf >= 3 })))
    const tot = all.reduce((s, e) => s + e.amt, 0)
    const low = all.filter(e => e.low).reduce((s, e) => s + e.amt, 0)
    if (tot > 0 && low / tot > 0.5) {
      recos.push({
        compte: ca.account, compteLabel: ca.label,
        motif: 'Tiers difficile à identifier dans les libellés — demander au cabinet d\'indiquer le nom du tiers (ou un compte auxiliaire) sur chaque écriture pour affiner le suivi.',
      })
    }
  }

  return {
    companyKey, companyLabel: co.name || companyKey,
    exerciceN, exerciceN1, monthsN, nbMois: mmSet.size, periodeComplete, histoLimite,
    caN, caN1, resultatN, resultatN1,
    variation: resultatN - resultatN1,
    variationPct: pctVar(resultatN, resultatN1),
    resPctCaN, resPctCaN1, pointsCa,
    totalProduitsN, totalProduitsN1, totalChargesN, totalChargesN1,
    produits, charges,
    questions: questions.slice(0, 20),
    recos: recos.slice(0, 10),
    params,
  }
}
