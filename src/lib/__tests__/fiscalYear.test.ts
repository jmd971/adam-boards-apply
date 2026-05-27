import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { fiscalMonthIndex, fiscalYearOf, currentFiscalYear, buildRAW } from '@/lib/calc'
import type { CompanyDataRow, FecAccount } from '@/types'

function fec(mo: Record<string, [number, number]>, label = ''): FecAccount {
  return { mo, l: label, e: [] }
}

function row(over: Partial<CompanyDataRow>): CompanyDataRow {
  return {
    id: 'r1', tenant_id: 't1', company_key: 'MC', period: 'N', fiscal_year: '2026',
    pl_data: {}, bilan_data: {}, months: [], entry_count: 0, source: 'manual',
    created_at: '2026-05-13T00:00:00Z', updated_at: '2026-05-13T00:00:00Z',
    ...over,
  }
}

/* ─── Helpers purs ────────────────────────────────────────────────────────── */

describe('fiscalMonthIndex', () => {
  it('année civile (startMonth=1) : jan=0 … déc=11', () => {
    expect(fiscalMonthIndex('2026-01', 1)).toBe(0)
    expect(fiscalMonthIndex('2026-06', 1)).toBe(5)
    expect(fiscalMonthIndex('2026-12', 1)).toBe(11)
  })
  it('exercice oct→sep (startMonth=10) : oct=0 … sep=11', () => {
    expect(fiscalMonthIndex('2025-10', 10)).toBe(0)
    expect(fiscalMonthIndex('2025-11', 10)).toBe(1)
    expect(fiscalMonthIndex('2025-12', 10)).toBe(2)
    expect(fiscalMonthIndex('2026-01', 10)).toBe(3)
    expect(fiscalMonthIndex('2026-09', 10)).toBe(11)
  })
  it('startMonth par défaut = 1', () => {
    expect(fiscalMonthIndex('2026-03')).toBe(2)
  })
})

describe('fiscalYearOf (libellé = année de clôture)', () => {
  it('année civile : exercice = année du mois', () => {
    expect(fiscalYearOf('2026-03', 1)).toBe(2026)
    expect(fiscalYearOf('2025-12', 1)).toBe(2025)
  })
  it('oct→sep : oct 2025..sep 2026 = exercice 2026', () => {
    expect(fiscalYearOf('2025-10', 10)).toBe(2026)
    expect(fiscalYearOf('2025-12', 10)).toBe(2026)
    expect(fiscalYearOf('2026-01', 10)).toBe(2026)
    expect(fiscalYearOf('2026-09', 10)).toBe(2026)
  })
  it('oct→sep : exercice précédent', () => {
    expect(fiscalYearOf('2025-09', 10)).toBe(2025)
    expect(fiscalYearOf('2024-10', 10)).toBe(2025)
  })
})

describe('currentFiscalYear', () => {
  it('année civile : exercice = année courante', () => {
    expect(currentFiscalYear(1, new Date('2026-05-15'))).toBe(2026)
  })
  it('oct→sep : mai 2026 ∈ exercice oct25→sep26 = 2026', () => {
    expect(currentFiscalYear(10, new Date('2026-05-15'))).toBe(2026)
  })
  it('oct→sep : novembre 2025 ∈ exercice oct25→sep26 = 2026', () => {
    expect(currentFiscalYear(10, new Date('2025-11-15'))).toBe(2026)
    expect(currentFiscalYear(1,  new Date('2025-11-15'))).toBe(2025)
  })
})

/* ─── buildRAW avec exercice fiscal non calendaire ───────────────────────── */

describe('buildRAW — exercice fiscal non calendaire', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-05-15')) })
  afterAll(() => vi.useRealTimers())

  it('startMonth=10 : tout l’exercice oct25→sep26 va dans pn (N)', () => {
    const raw = buildRAW(
      [row({ period: 'N', pl_data: { '707': fec({
        '2025-10': [0, 100], '2025-11': [0, 100], '2025-12': [0, 100],
        '2026-01': [0, 100], '2026-09': [0, 100],
      }) } })],
      [], [],
      { MC: 10 },
    )
    expect(Object.keys(raw.companies.MC.pn['707'].mo).sort()).toEqual(
      ['2025-10', '2025-11', '2025-12', '2026-01', '2026-09']
    )
    expect(raw.companies.MC.p1['707']).toBeUndefined()
    expect(raw.mn).toContain('2025-10')
    expect(raw.mn).toContain('2026-09')
  })

  it('startMonth=10 : oct24→sep25 va dans p1 (N-1)', () => {
    const raw = buildRAW(
      [row({ period: 'N', pl_data: { '707': fec({
        '2024-10': [0, 100], '2025-09': [0, 100],   // exercice 2025 = N-1
        '2025-10': [0, 100],                          // exercice 2026 = N
      }) } })],
      [], [],
      { MC: 10 },
    )
    expect(Object.keys(raw.companies.MC.p1['707'].mo).sort()).toEqual(['2024-10', '2025-09'])
    expect(Object.keys(raw.companies.MC.pn['707'].mo)).toEqual(['2025-10'])
  })

  it('backward-compat : sans fiscalSettings = année civile', () => {
    const raw = buildRAW(
      [row({ period: 'N', pl_data: { '707': fec({ '2026-03': [0, 100], '2025-03': [0, 100] }) } })],
      [],
    )
    expect(raw.companies.MC.pn['707'].mo['2026-03']).toEqual([0, 100])
    expect(raw.companies.MC.p1['707'].mo['2025-03']).toEqual([0, 100])
  })

  it('sociétés à exercices différents dans le même build', () => {
    const raw = buildRAW(
      [
        row({ company_key: 'MC',  period: 'N', pl_data: { '707': fec({ '2025-10': [0, 100] }) } }),
        row({ company_key: 'SFP', period: 'N', pl_data: { '707': fec({ '2025-10': [0, 200] }) } }),
      ],
      [], [],
      { MC: 10 },   // MC oct→sep ; SFP par défaut = janvier
    )
    // Pour MC (oct→sep), 2025-10 ∈ exercice 2026 = N → pn
    expect(raw.companies.MC.pn['707'].mo['2025-10']).toEqual([0, 100])
    // Pour SFP (janvier), 2025-10 ∈ exercice 2025 = N-1 → p1
    expect(raw.companies.SFP.p1['707'].mo['2025-10']).toEqual([0, 200])
  })

  it('saisie manuelle classée par exercice fiscal de la société', () => {
    const raw = buildRAW(
      [row({ period: 'N', pl_data: { '707': fec({ '2025-10': [0, 100] }) } })],
      [],
      [{ id: 'm1', tenant_id: 't1', company_key: 'MC', entry_date: '2025-11-15',
         amount_ht: '500', category: 'Achat', subcategory: '', account_num: '607',
         source: 'manual', created_at: '2025-11-15T00:00:00Z' } as any],
      { MC: 10 },
    )
    // novembre 2025 ∈ exercice oct25→sep26 = N → pn
    expect(raw.companies.MC.pn['607'].mo['2025-11']).toEqual([500, 0])
  })
})
