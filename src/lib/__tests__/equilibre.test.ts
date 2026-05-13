import { describe, it, expect } from 'vitest'
import { computePlCalc } from '@/lib/calc'
import { EQ } from '@/lib/structure'
import type { RAWData, CompanyRaw, FecAccount } from '@/types'

/* ─── Fixture helpers ────────────────────────────────────────────────────── */

function acc(monthly: Record<string, [number, number]>, label = ''): FecAccount {
  return { mo: monthly, l: label, e: [] }
}

function fixtureRAW(opts: {
  pn?: Record<string, [number, number][]>   // {acc: [[d, c]]} aligned with months
  p1?: Record<string, [number, number][]>
  months?: string[]
  monthsN1?: string[]
}): { RAW: RAWData; selectedMs: string[]; allMsN1Same: string[] } {
  const months   = opts.months   ?? ['2026-01', '2026-02', '2026-03']
  const monthsN1 = opts.monthsN1 ?? ['2025-01', '2025-02', '2025-03']

  const buildAcct = (rows: Record<string, [number, number][]>, ms: string[]) => {
    const out: Record<string, FecAccount> = {}
    for (const [k, vals] of Object.entries(rows)) {
      const mo: Record<string, [number, number]> = {}
      vals.forEach((v, i) => { mo[ms[i]] = v })
      out[k] = acc(mo)
    }
    return out
  }

  const co: CompanyRaw = {
    name: 'Test SA',
    pn:   buildAcct(opts.pn ?? {}, months),
    p1:   buildAcct(opts.p1 ?? {}, monthsN1),
    p2:   {}, bn: {}, b1: {}, b2: {},
    bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
  }

  const RAW: RAWData = {
    companies: { TEST: co },
    mn: months, m1: monthsN1, m2: [],
    keys: ['TEST'],
  }

  return { RAW, selectedMs: months, allMsN1Same: monthsN1 }
}

function runEQ(RAW: RAWData, selectedMs: string[], allMsN1Same: string[]) {
  const msSrc = selectedMs.map(() => 'pn' as const)
  const msN1Src = allMsN1Same.map(() => 'p1' as const)
  return computePlCalc(RAW, ['TEST'], selectedMs, msSrc, allMsN1Same, msN1Src, {}, EQ, false)
}

/* ─── Tests Équilibre ────────────────────────────────────────────────────── */

describe('Equilibre (computePlCalc with EQ structure)', () => {
  it('calcule tot_ventes = somme des comptes 7xx (convention produit : crédit − débit)', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '707': [[0, 10_000], [0, 12_000], [50, 8_000]],  // ventes marchandises : 10k + 12k + 7950 = 29 950
        '706': [[0, 3_000],  [0, 4_000],  [0, 5_000]],   // prestations
        '708': [[0, 1_000],  [0, 0],      [0, 0]],       // annexes
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    // 29950 + 12000 + 1000 = 42950
    expect(plCalc['tot_ventes'].cumulN).toBe(42_950)
  })

  it('calcule tot_achats = somme des comptes 60x (convention charge : débit − crédit)', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '607':  [[5_000, 100], [4_000, 0], [3_000, 0]],   // achats mdse : 4900 + 4000 + 3000 = 11 900
        '601':  [[1_000, 0],   [1_500, 0], [2_000, 0]],   // mat. premières : 4500
        '6063': [[200, 0],     [200, 0],   [200, 0]],     // sous-prefix de 60: 600
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    // 11900 + 4500 + 600 = 17000
    expect(plCalc['tot_achats'].cumulN).toBe(17_000)
  })

  it('calcule tot_charges_eq = somme des comptes 61 à 69 (hors 60)', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '613': [[1_000, 0]],   // location
        '622': [[500, 0]],     // honoraires
        '641': [[5_000, 0]],   // salaires
        '645': [[2_000, 0]],   // charges sociales
        '681': [[1_500, 0]],   // dotations amort.
        '66':  [[200, 0]],     // charges fin.
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    expect(plCalc['tot_charges_eq'].cumulN).toBe(10_200)
  })

  it('marge_eq = tot_ventes − tot_achats', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '707': [[0, 100_000]],
        '607': [[40_000, 0]],
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    expect(plCalc['tot_ventes'].cumulN).toBe(100_000)
    expect(plCalc['tot_achats'].cumulN).toBe(40_000)
    expect(plCalc['marge_eq'].cumulN).toBe(60_000)
  })

  it('resultat_eq = marge_eq − tot_charges_eq', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '707': [[0, 100_000]],
        '607': [[40_000, 0]],
        '641': [[15_000, 0]],
        '613': [[10_000, 0]],
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    // Marge = 100k − 40k = 60k, Charges = 15k + 10k = 25k, Résultat = 35k
    expect(plCalc['marge_eq'].cumulN).toBe(60_000)
    expect(plCalc['tot_charges_eq'].cumulN).toBe(25_000)
    expect(plCalc['resultat_eq'].cumulN).toBe(35_000)
  })

  it("résultat peut être négatif quand les charges dépassent la marge", () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '707': [[0, 50_000]],
        '607': [[30_000, 0]],
        '641': [[30_000, 0]],
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    // Marge = 20k, Charges = 30k, Résultat = -10k
    expect(plCalc['resultat_eq'].cumulN).toBe(-10_000)
  })

  it('calcule cumulN1S à partir des comptes p1 (exercice N-1)', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: { '707': [[0, 100_000]] },
      p1: { '707': [[0, 80_000]] },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    expect(plCalc['tot_ventes'].cumulN).toBe(100_000)
    expect(plCalc['tot_ventes'].cumulN1S).toBe(80_000)
  })

  it('évite le double comptage quand le FEC a 706 ET 7061 (sous-compte)', () => {
    // Bug récurrent : un prefix scan naïf compte 706 puis 7061 deux fois.
    // sumByPrefixes doit utiliser des clés EXACTES du FEC, pas un prefix-scan.
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '706':  [[0, 10_000]],
        '7061': [[0, 5_000]],
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    // 10k + 5k = 15k, surtout PAS 25k ni 20k
    expect(plCalc['tot_ventes'].cumulN).toBe(15_000)
  })

  it('marge_eq mensuelle est cohérente avec ventes − achats du même mois', () => {
    const { RAW, selectedMs, allMsN1Same } = fixtureRAW({
      pn: {
        '707': [[0, 10_000], [0, 20_000], [0, 30_000]],
        '607': [[4_000, 0],  [8_000, 0],  [12_000, 0]],
      },
    })
    const plCalc = runEQ(RAW, selectedMs, allMsN1Same)
    expect(plCalc['marge_eq'].monthsN).toEqual([6_000, 12_000, 18_000])
  })
})
