import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildRAW } from '@/lib/calc'
import type { CompanyDataRow, FecAccount } from '@/types'

/* ─── Fixture helpers ────────────────────────────────────────────────────── */

function fec(mo: Record<string, [number, number]>, label = ''): FecAccount {
  return { mo, l: label, e: [] }
}

function row(over: Partial<CompanyDataRow>): CompanyDataRow {
  return {
    id: 'r1',
    tenant_id: 't1',
    company_key: 'MC',
    period: 'N',
    fiscal_year: '2025',
    pl_data: {},
    bilan_data: {},
    months: [],
    entry_count: 0,
    source: 'manual',
    created_at: '2026-05-13T00:00:00Z',
    updated_at: '2026-05-13T00:00:00Z',
    ...over,
  }
}

/* ─── buildRAW transforms ────────────────────────────────────────────────── */

describe('buildRAW — Supabase rows → RAW structure', () => {
  // Date système figée pour rendre la classification N/N-1/N-2 déterministe
  // (sinon les fixtures 2026/2025/2024 deviennent fausses au changement d'année).
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-05-15')) })
  afterAll(() => vi.useRealTimers())

  it('renvoie un RAW vide quand aucune ligne', () => {
    const raw = buildRAW([], [])
    expect(raw.keys).toEqual([])
    expect(raw.companies).toEqual({})
    expect(raw.mn).toEqual([])
    expect(raw.m1).toEqual([])
  })

  it('crée companies[X] avec le name venant de company_name', () => {
    const raw = buildRAW([row({ company_key: 'MC', company_name: 'Ma Compta' } as any)], [])
    expect(raw.keys).toEqual(['MC'])
    expect(raw.companies.MC.name).toBe('Ma Compta')
  })

  it("fallback name = company_key (avec _ → espaces) si pas de company_name", () => {
    const raw = buildRAW([row({ company_key: 'SCI_TOURIZK' })], [])
    expect(raw.companies.SCI_TOURIZK.name).toBe('SCI TOURIZK')
  })

  it('range pl_data dans pn quand period=N (exercice courant = 2026)', () => {
    // Date figée à 2026 → les mois 2026 sont l'exercice N. La classification se fait
    // désormais par exercice fiscal réel, pas par le tag row.period (calendaire).
    const raw = buildRAW([row({
      period: 'N',
      pl_data: {
        '7060000000': fec({ '2026-01': [0, 1000], '2026-02': [0, 2000] }, 'PRESTATIONS'),
      },
    })], [])
    // Le compte doit exister dans pn[acc] avec son mo et son label
    expect(raw.companies.MC.pn['7060000000']).toBeDefined()
    expect(raw.companies.MC.pn['7060000000'].l).toBe('PRESTATIONS')
    expect(raw.companies.MC.pn['7060000000'].mo['2026-01']).toEqual([0, 1000])
    // Et p1 doit être vide
    expect(raw.companies.MC.p1['7060000000']).toBeUndefined()
  })

  it('range pl_data dans p1 quand period=N-1 (bug observé hier)', () => {
    // C'est le scénario typique : FEC 2025 auto-classé en N-1, doit aller dans p1
    const raw = buildRAW([row({
      period: 'N-1',
      pl_data: {
        '7060000000': fec({ '2025-01': [0, 1000] }, 'PRESTATIONS'),
      },
    })], [])
    expect(raw.companies.MC.p1['7060000000']).toBeDefined()
    expect(raw.companies.MC.p1['7060000000'].mo['2025-01']).toEqual([0, 1000])
    expect(raw.companies.MC.pn['7060000000']).toBeUndefined()
  })

  it('range pl_data dans p2 quand period=N-2', () => {
    const raw = buildRAW([row({
      period: 'N-2',
      pl_data: { '707': fec({ '2024-01': [0, 500] }) },
    })], [])
    expect(raw.companies.MC.p2['707']).toBeDefined()
    expect(raw.companies.MC.p2['707'].mo['2024-01']).toEqual([0, 500])
  })

  it('agrège les mois dans RAW.mn / RAW.m1 / RAW.m2 selon la période', () => {
    const raw = buildRAW([
      row({ period: 'N',   pl_data: { '707': fec({ '2026-01': [0, 100], '2026-02': [0, 100] }) } }),
      row({ period: 'N-1', pl_data: { '707': fec({ '2025-06': [0, 100] }) } }),
      row({ period: 'N-2', pl_data: { '707': fec({ '2024-12': [0, 100] }) } }),
    ], [])
    expect(raw.mn).toEqual(['2026-01', '2026-02'])
    expect(raw.m1).toEqual(['2025-06'])
    expect(raw.m2).toEqual(['2024-12'])
  })

  it('multi-sociétés : crée companies séparés', () => {
    const raw = buildRAW([
      row({ company_key: 'MC', pl_data: { '707': fec({ '2026-01': [0, 100] }) } }),
      row({ company_key: 'PP', pl_data: { '707': fec({ '2026-01': [0, 200] }) } }),
    ], [])
    expect(raw.keys.sort()).toEqual(['MC', 'PP'])
    expect(raw.companies.MC.pn['707'].mo['2026-01']).toEqual([0, 100])
    expect(raw.companies.PP.pn['707'].mo['2026-01']).toEqual([0, 200])
  })

  it('range bilan_data dans bn/b1/b2 selon la période', () => {
    const raw = buildRAW([row({
      period: 'N',
      bilan_data: { '411': { s: 1000, l: 'Clients', e: [], top: [] } as any },
    })], [])
    expect(raw.companies.MC.bn['411']).toBeDefined()
    expect((raw.companies.MC.bn['411'] as any).s).toBe(1000)
  })

  it('attache client_data et ve_entries sur N', () => {
    const raw = buildRAW([row({
      period: 'N',
      client_data: { 'C1': { n: 'Dupont', ca: 5000, entries: 3 } },
      ve_entries: [{ date: '2026-01-15', acc: '707', credit: 100, debit: 0 } as any],
    })], [])
    expect(raw.companies.MC.cdN).toEqual({ 'C1': { n: 'Dupont', ca: 5000, entries: 3 } })
    expect(raw.companies.MC.veN).toHaveLength(1)
    expect(raw.companies.MC.cdN1).toEqual({})  // N-1 reste vide
  })

  it('intègre les manualEntries en plus du FEC dans pn[acc].mo', () => {
    const raw = buildRAW(
      [row({ pl_data: { '707': fec({ '2026-01': [0, 1000] }) } })],
      [],
      [{
        id: 'me1', tenant_id: 't1', company_key: 'MC',
        entry_date: '2026-02-15', amount_ht: '500',
        category: 'Vente', subcategory: 'Prestations',
        counterpart: 'Dupont', account_num: '707',
        source: 'manual', created_at: '2026-02-15T00:00:00Z',
      } as any]
    )
    // Le compte 707 doit cumuler FEC (Jan) + manual entry (Fév)
    expect(raw.companies.MC.pn['707'].mo['2026-01']).toEqual([0, 1000])
    expect(raw.companies.MC.pn['707'].mo['2026-02']).toEqual([0, 500])
  })

  it('crée companies[X] même si X n\'a que des manualEntries (pas de FEC)', () => {
    const raw = buildRAW([], [], [{
      id: 'me1', tenant_id: 't1', company_key: 'NEW_CO',
      entry_date: '2026-01-15', amount_ht: '200',
      category: 'Vente', subcategory: 'P',
      counterpart: 'D', account_num: '707',
      source: 'manual', created_at: '2026-01-15T00:00:00Z',
    } as any])
    expect(raw.companies.NEW_CO).toBeDefined()
    expect(raw.companies.NEW_CO.pn['707'].mo['2026-01']).toEqual([0, 200])
  })
})
