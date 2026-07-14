import { describe, it, expect } from 'vitest'
import { buildResultatTheme } from '@/hooks/useResultatTheme'
import type { RAWData, FecAccount } from '@/types'

// Fabrique un compte FEC minimal { mo, l, e }
const fa = (l: string, mo: Record<string, [number, number]>): FecAccount => ({ l, mo, e: [] })

// RAW synthétique : 1 société, exercice civil (janvier), 2 mois (jan/fév 2026).
//  707 Ventes        : crédit 1000 (jan) + 500 (fév)          → produit
//  607 Achats        : débit  400  (jan) + 100 (fév)          → charge
//  603 Var. stocks   : crédit 50   (jan)                      → OD (doit être IGNORÉ)
//  6221 Honoraires GBP: débit  200 (jan)                      → charge + INTRA-GROUPE
function makeRAW(): RAWData {
  return {
    keys: ['ACME'],
    mn: ['2026-01', '2026-02'],
    m1: ['2025-01', '2025-02'],
    m2: [],
    companies: {
      ACME: {
        name: 'ACME', p2: {}, bn: {}, b1: {}, b2: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
        pn: {
          '707':  fa('Ventes',            { '2026-01': [0, 1000], '2026-02': [0, 500] }),
          '607':  fa('Achats',            { '2026-01': [400, 0],  '2026-02': [100, 0] }),
          '603':  fa('Variation stocks',  { '2026-01': [0, 50] }),
          '6221': fa('HONORAIRES PRESTATIONS GBP', { '2026-01': [200, 0] }),
        },
        p1: {
          '707':  fa('Ventes',            { '2025-01': [0, 800], '2025-02': [0, 400] }),
          '607':  fa('Achats',            { '2025-01': [300, 0], '2025-02': [100, 0] }),
        },
        bud: {
          // budget indexé par mois fiscal (jan=0…) ; produit positif, charge positif
          '707': { b: Array(12).fill(0).map((_, i) => i < 2 ? 1200 : 0), t: 'p', l: 'Ventes' },
          '607': { b: Array(12).fill(0).map((_, i) => i < 2 ? 300 : 0),  t: 'c', l: 'Achats' },
        },
      } as any,
    },
  } as RAWData
}

const TODAY = new Date('2026-03-15')

describe('buildResultatTheme — Thème 1 (hors OD, intra-groupe, mensuel)', () => {
  it('résultat hors OD : exclut le compte OD 603', () => {
    const t = buildResultatTheme(makeRAW(), { ACME: 1 }, ['ACME'], ['GBP'], { today: TODAY })!
    expect(t).not.toBeNull()
    // Produits = 1500 (707). Charges = 500 (607) + 200 (6221) = 700. 603 exclu.
    expect(t.produitsN).toBe(1500)
    expect(t.chargesN).toBe(700)
    expect(t.resultatN).toBe(800)         // 1500 - 700, SANS la variation de stock (OD)
    // N-1 même période : produits 1200, charges 400 → résultat 800
    expect(t.resultatN1).toBe(800)
  })

  it('budget (version active) sur la période, hors OD', () => {
    const t = buildResultatTheme(makeRAW(), { ACME: 1 }, ['ACME'], ['GBP'], { today: TODAY })!
    expect(t.hasBudget).toBe(true)
    // produits budget = 1200*2 = 2400 ; charges budget = 300*2 = 600 → résultat budget 1800
    expect(t.produitsBudget).toBe(2400)
    expect(t.chargesBudget).toBe(600)
    expect(t.resultatBudget).toBe(1800)
  })

  it('intra-groupe : détecte 6221 « HONORAIRES … GBP », gardé dans le résultat', () => {
    const t = buildResultatTheme(makeRAW(), { ACME: 1 }, ['ACME'], ['GBP'], { today: TODAY })!
    expect(t.intraGroup).toHaveLength(1)
    expect(t.intraGroup[0]).toMatchObject({ account: '6221', entity: 'GBP', sens: 'charge', montantN: 200 })
    expect(t.intraGroupChargesN).toBe(200)
    // Il reste bien compté dans les charges (non éliminé)
    expect(t.chargesN).toBe(700)
  })

  it('série mensuelle : résultat par mois, hors OD', () => {
    const t = buildResultatTheme(makeRAW(), { ACME: 1 }, ['ACME'], ['GBP'], { today: TODAY })!
    expect(t.monthly.map(p => p.month)).toEqual(['2026-01', '2026-02'])
    // Jan : 1000 - 400 - 200 = 400 (603 exclu). Fév : 500 - 100 = 400.
    expect(t.monthly[0].resultatN).toBe(400)
    expect(t.monthly[1].resultatN).toBe(400)
    // N-1 même mois calendaire : jan 800-300=500 ; fév 400-100=300
    expect(t.monthly[0].resultatN1).toBe(500)
    expect(t.monthly[1].resultatN1).toBe(300)
    // somme mensuelle N = résultat cumulé
    expect(t.monthly.reduce((s, p) => s + p.resultatN, 0)).toBe(t.resultatN)
  })

  it('cutoff : limite la période (ex. fin janvier)', () => {
    const t = buildResultatTheme(makeRAW(), { ACME: 1 }, ['ACME'], ['GBP'], { today: TODAY, cutoffMonth: '2026-01' })!
    expect(t.monthly).toHaveLength(1)
    expect(t.resultatN).toBe(400)         // janvier seul
    expect(t.resultatN1).toBe(500)        // N-1 janvier seul (même période)
  })
})
