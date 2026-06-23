import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { ManualEntry } from '@/types'

export interface TiersStats {
  name: string
  category: 'Vente' | 'Achat' | 'Depense' | 'Immobilisation'
  totalHt: number
  count: number
  sharePercent: number
  firstSeen: string
  lastSeen: string
  isNew: boolean
  avgDelaiPaiement: number | null
}

export interface MontantOutlier {
  entry: ManualEntry
  zScore: number
  meanHt: number
  stdHt: number
}

export interface TendanceMensuelle {
  month: string
  ventes: number
  achats: number
  depenses: number
  total: number
}

export interface PaiementStats {
  mode: string
  count: number
  totalHt: number
  sharePercent: number
}

export interface RetardPaiement {
  entry: ManualEntry
  delaiJours: number
}

export interface RapportData {
  periodStart: string
  periodEnd: string
  companyKeys: string[]
  tendancesMensuelles: TendanceMensuelle[]
  rupturesTendance: { month: string; category: string; delta: number; deltaPct: number }[]
  topClients: TiersStats[]
  topFournisseurs: TiersStats[]
  nouveauxTiers: TiersStats[]
  concentrationClientPct: number
  outliers: MontantOutlier[]
  paiementStats: PaiementStats[]
  retards: RetardPaiement[]
  delaiMoyenClient: number | null
  delaiMoyenFourn: number | null
  modelEco: 'services_recurrents' | 'produits_ponctuels' | 'mixte' | 'indetermine'
  saisonnaliteMois: number[]
  dependanceTiers: boolean
}

function toHt(e: ManualEntry): number {
  return parseFloat(e.amount_ht ?? e.amount_ttc ?? '0') || 0
}

function toYYYYMM(date: string): string {
  return date.slice(0, 7)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function useRapportData(): RapportData | null {
  const manualEntries = useAppStore(s => s.manualEntries)
  const filters = useAppStore(s => s.filters)

  return useMemo(() => {
    if (!manualEntries.length) return null

    const now = new Date()
    const endDate = now.toISOString().slice(0, 10)
    const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1)
      .toISOString().slice(0, 10)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      .toISOString().slice(0, 10)

    const selCo = filters.selCo ?? []
    const entries = manualEntries.filter(e =>
      e.entry_date >= startDate &&
      e.entry_date <= endDate &&
      (selCo.length === 0 || selCo.includes(e.company_key))
    )

    if (!entries.length) return null

    const companyKeys = [...new Set(entries.map(e => e.company_key))]

    // Tendances mensuelles
    const monthMap = new Map<string, TendanceMensuelle>()
    for (const e of entries) {
      const m = toYYYYMM(e.entry_date)
      if (!monthMap.has(m)) monthMap.set(m, { month: m, ventes: 0, achats: 0, depenses: 0, total: 0 })
      const row = monthMap.get(m)!
      const ht = toHt(e)
      if (e.category === 'Vente') row.ventes += ht
      else if (e.category === 'Achat') row.achats += ht
      else if (e.category === 'Depense') row.depenses += ht
      row.total += ht
    }
    const tendancesMensuelles = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month))

    // Ruptures de tendance (delta > 30% vs moyenne 6 mois précédents)
    const rupturesTendance: RapportData['rupturesTendance'] = []
    const cats = ['ventes', 'achats', 'depenses'] as const
    for (const cat of cats) {
      for (let i = 6; i < tendancesMensuelles.length; i++) {
        const window6 = tendancesMensuelles.slice(i - 6, i).map(r => r[cat])
        const mean = window6.reduce((a, b) => a + b, 0) / window6.length
        const current = tendancesMensuelles[i][cat]
        if (mean > 0) {
          const deltaPct = ((current - mean) / mean) * 100
          if (Math.abs(deltaPct) > 30) {
            rupturesTendance.push({ month: tendancesMensuelles[i].month, category: cat, delta: current - mean, deltaPct })
          }
        }
      }
    }

    // Stats par tiers
    function buildTiersStats(subset: ManualEntry[], category: ManualEntry['category']): TiersStats[] {
      const map = new Map<string, { totalHt: number; count: number; dates: string[]; payDays: number[] }>()
      const totalCat = subset.filter(e => e.category === category).reduce((s, e) => s + toHt(e), 0)
      for (const e of subset.filter(e => e.category === category)) {
        const key = e.counterpart ?? e.label ?? 'Inconnu'
        if (!map.has(key)) map.set(key, { totalHt: 0, count: 0, dates: [], payDays: [] })
        const row = map.get(key)!
        row.totalHt += toHt(e)
        row.count += 1
        row.dates.push(e.entry_date)
        if (e.payment_date) row.payDays.push(daysBetween(e.entry_date, e.payment_date))
      }
      return [...map.entries()]
        .map(([name, s]) => {
          const sorted = [...s.dates].sort()
          return {
          name,
          category,
          totalHt: s.totalHt,
          count: s.count,
          sharePercent: totalCat > 0 ? (s.totalHt / totalCat) * 100 : 0,
          firstSeen: sorted[0],
          lastSeen: sorted[sorted.length - 1],
          isNew: sorted[0] >= threeMonthsAgo,
          avgDelaiPaiement: s.payDays.length ? s.payDays.reduce((a, b) => a + b, 0) / s.payDays.length : null,
          }
        })
        .sort((a, b) => b.totalHt - a.totalHt)
    }

    const topClients = buildTiersStats(entries, 'Vente').slice(0, 10)
    const topFournisseurs = [
      ...buildTiersStats(entries, 'Achat'),
      ...buildTiersStats(entries, 'Depense'),
    ].sort((a, b) => b.totalHt - a.totalHt).slice(0, 10)
    const nouveauxTiers = [...topClients, ...topFournisseurs].filter(t => t.isNew)
    const concentrationClientPct = topClients[0]?.sharePercent ?? 0

    // Outliers montants (z-score par catégorie, seuil 2σ)
    const outliers: MontantOutlier[] = []
    for (const cat of ['Vente', 'Achat', 'Depense', 'Immobilisation'] as const) {
      const sub = entries.filter(e => e.category === cat)
      const values = sub.map(toHt)
      const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1)
      const std = stdDev(values)
      if (std === 0) continue
      for (const e of sub) {
        const z = (toHt(e) - mean) / std
        if (Math.abs(z) > 2) outliers.push({ entry: e, zScore: z, meanHt: mean, stdHt: std })
      }
    }
    outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

    // Paiements
    const modeMap = new Map<string, { count: number; totalHt: number }>()
    const retards: RetardPaiement[] = []
    const clientDelais: number[] = []
    const fournDelais: number[] = []

    for (const e of entries) {
      const mode = e.payment_mode ?? 'inconnu'
      if (!modeMap.has(mode)) modeMap.set(mode, { count: 0, totalHt: 0 })
      const m = modeMap.get(mode)!
      m.count += 1
      m.totalHt += toHt(e)
      if (e.payment_date) {
        const delai = daysBetween(e.entry_date, e.payment_date)
        if (e.category === 'Vente') clientDelais.push(delai)
        else fournDelais.push(delai)
      } else if (e.payment_mode !== 'comptant') {
        const delai = daysBetween(e.entry_date, endDate)
        if (delai > 45) retards.push({ entry: e, delaiJours: delai })
      }
    }

    const totalEntries = entries.length || 1
    const paiementStats: PaiementStats[] = [...modeMap.entries()]
      .map(([mode, s]) => ({ mode, count: s.count, totalHt: s.totalHt, sharePercent: (s.count / totalEntries) * 100 }))
      .sort((a, b) => b.count - a.count)

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    const delaiMoyenClient = avg(clientDelais)
    const delaiMoyenFourn = avg(fournDelais)

    // Modèle économique
    const venteEntries = entries.filter(e => e.category === 'Vente')
    const clientsUniques = new Set(venteEntries.map(e => e.counterpart ?? e.label)).size
    const recurrenceScore = clientsUniques > 0 ? venteEntries.length / clientsUniques : 0
    const modelEco: RapportData['modelEco'] =
      recurrenceScore > 4 ? 'services_recurrents' :
      recurrenceScore > 1.5 ? 'mixte' :
      venteEntries.length > 0 ? 'produits_ponctuels' : 'indetermine'

    // Saisonnalité
    const ventesByMonth = Array(12).fill(0)
    for (const e of venteEntries) {
      ventesByMonth[new Date(e.entry_date).getMonth()] += toHt(e)
    }
    const meanMensuel = ventesByMonth.reduce((a, b) => a + b, 0) / 12
    const saisonnaliteMois = ventesByMonth
      .map((v, i) => ({ v, i }))
      .filter(x => meanMensuel > 0 && x.v > meanMensuel * 1.3)
      .map(x => x.i)

    return {
      periodStart: startDate,
      periodEnd: endDate,
      companyKeys,
      tendancesMensuelles,
      rupturesTendance,
      topClients,
      topFournisseurs,
      nouveauxTiers,
      concentrationClientPct,
      outliers,
      paiementStats,
      retards,
      delaiMoyenClient,
      delaiMoyenFourn,
      modelEco,
      saisonnaliteMois,
      dependanceTiers: concentrationClientPct > 50,
    }
  }, [manualEntries, filters.selCo])
}
