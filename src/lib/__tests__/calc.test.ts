import { describe, it, expect } from 'vitest'
import {
  fmt, fmt2, pct,
  monthLabel, fiscalIndex, monthIdx,
  sumArr, solde,
  getCoColor,
} from '@/lib/calc'

describe('fmt', () => {
  it('rounds and uses French locale with narrow no-break space', () => {
    expect(fmt(1234567)).toBe('1 234 567')
    expect(fmt(1234.7)).toBe('1 235') // arrondi
    expect(fmt(0)).toBe('0')
    expect(fmt(-500)).toBe('-500')
  })
})

describe('fmt2', () => {
  it('keeps 2 decimals with FR comma separator', () => {
    expect(fmt2(0.1)).toBe('0,10')
    expect(fmt2(1234.5)).toMatch(/^1\D234,50$/) // tolère diverses formes d'espace
  })
})

describe('pct', () => {
  // pct utilise toFixed (point décimal) +   avant %. Incohérence connue avec fmt() FR.
  it('formats fraction as percentage with 1 decimal', () => {
    expect(pct(0.1)).toBe(`10.0 %`)
    expect(pct(0.235)).toBe(`23.5 %`)
    expect(pct(0)).toBe(`0.0 %`)
  })
  it('returns em-dash for non-finite values', () => {
    expect(pct(NaN)).toBe('—')
    expect(pct(Infinity)).toBe('—')
  })
})

describe('monthLabel', () => {
  it('formats YYYY-MM as short FR label', () => {
    expect(monthLabel('2026-01')).toBe(`Jan 26`)
    expect(monthLabel('2025-12')).toBe(`Déc 25`)
  })
  it('returns empty string for empty input', () => {
    expect(monthLabel('')).toBe('')
  })
})

describe('fiscalIndex', () => {
  it('returns 0-based month index from YYYY-MM', () => {
    expect(fiscalIndex('2026-01')).toBe(0)
    expect(fiscalIndex('2026-12')).toBe(11)
    expect(fiscalIndex('2025-06')).toBe(5)
  })
})

describe('monthIdx', () => {
  it('returns sortable index spanning years', () => {
    expect(monthIdx('2026-01')).toBeLessThan(monthIdx('2026-02'))
    expect(monthIdx('2025-12')).toBeLessThan(monthIdx('2026-01'))
    expect(monthIdx('2025-06')).toBeLessThan(monthIdx('2026-06'))
  })
})

describe('sumArr', () => {
  it('sums numeric arrays', () => {
    expect(sumArr([1, 2, 3])).toBe(6)
    expect(sumArr([])).toBe(0)
    expect(sumArr([-1, 1, -2, 2])).toBe(0)
  })
})

describe('solde — convention comptable FR (PCG)', () => {
  it('charge: solde = debit - credit (positif si charge effective)', () => {
    // Compte 607 Achats : 1000 debit, 100 credit (avoir) → solde 900
    expect(solde([[1000, 100]], true)).toEqual([900])
  })
  it('produit: solde = credit - debit (positif si vente effective)', () => {
    // Compte 706 Ventes : 50 debit (annulation), 1000 credit → solde 950
    expect(solde([[50, 1000]], false)).toEqual([950])
  })
  it('applique la convention par mois independamment', () => {
    expect(solde([[1000, 100], [500, 50]], true)).toEqual([900, 450])
    expect(solde([[50, 1000], [25, 500]], false)).toEqual([950, 475])
  })
  it('renvoie zero quand debit = credit', () => {
    expect(solde([[500, 500]], true)).toEqual([0])
    expect(solde([[500, 500]], false)).toEqual([0])
  })
})

describe('getCoColor', () => {
  it('returns a hex color from the palette', () => {
    expect(getCoColor('ALPHA')).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('is deterministic for the same key', () => {
    expect(getCoColor('MC')).toBe(getCoColor('MC'))
    expect(getCoColor('PP')).toBe(getCoColor('PP'))
  })
  it('returns different colors for different keys (mostly)', () => {
    const colors = ['MC', 'PP', 'SFP', 'cocon'].map(getCoColor)
    expect(new Set(colors).size).toBeGreaterThan(1)
  })
})
