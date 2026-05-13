import { describe, it, expect } from 'vitest'
import { fecToSaleTransactions, diagnoseFec } from '@/lib/fecSales'
import type { RAWData, ClientInfo } from '@/types'

function buildRAW(cdN: Record<string, ClientInfo>, cdN1: Record<string, ClientInfo> = {}): RAWData {
  return {
    keys: ['MC'],
    mn: ['2026-01', '2026-02', '2026-03'],
    m1: ['2025-01', '2025-02', '2025-03'],
    m2: [],
    companies: {
      MC: {
        name: 'MC',
        pn: {}, p1: {}, p2: {}, bn: {}, b1: {}, b2: {},
        bud: {}, cdN, cdN1, veN: [], veN1: [],
      },
    },
  } as any
}

describe('fecToSaleTransactions', () => {
  it('retourne [] quand RAW est null', () => {
    expect(fecToSaleTransactions(null, ['MC'])).toEqual([])
  })

  it('génère une transaction par facture (entries) avec CA réparti', () => {
    const raw = buildRAW({
      'DUPONT': { n: 'DUPONT SAS', ca: 3000, entries: 3, lastDate: '2026-02-15' },
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(3)
    expect(txs[0].client_nom).toBe('DUPONT SAS')
    expect(txs[0].client_key).toBe('dupont')
    expect(txs.reduce((s, t) => s + t.montant, 0)).toBeCloseTo(3000)
    expect(txs[0].date_achat).toBe('2026-02-15')
  })

  it('utilise la dernière date du fiscal N si lastDate manquant', () => {
    const raw = buildRAW({
      'MARTIN': { n: 'MARTIN', ca: 500, entries: 1 },
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs[0].date_achat).toBe('2026-03-28')
  })

  it('combine clients N + N-1', () => {
    const raw = buildRAW(
      { 'DUPONT': { n: 'DUPONT', ca: 1000, entries: 2, lastDate: '2026-03-01' } },
      { 'MARTIN': { n: 'MARTIN', ca: 500,  entries: 1, lastDate: '2025-06-01' } },
    )
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(3)  // 2 DUPONT + 1 MARTIN
  })

  it('ignore les clients avec ca <= 0', () => {
    const raw = buildRAW({
      'OK':   { n: 'OK',   ca: 100,  entries: 1 },
      'ZERO': { n: 'ZERO', ca: 0,    entries: 0 },
      'NEG':  { n: 'NEG',  ca: -50,  entries: 0 },
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(1)
    expect(txs[0].client_nom).toBe('OK')
  })

  it('selCo vide = toutes les sociétés', () => {
    const raw = buildRAW({ 'A': { n: 'A', ca: 100, entries: 1 } })
    expect(fecToSaleTransactions(raw, []).length).toBe(1)
  })
})

describe('diagnoseFec', () => {
  it('compte clients, CA et factures correctement', () => {
    const raw = buildRAW(
      { 'A': { n: 'A', ca: 1000, entries: 2 },
        'B': { n: 'B', ca: 500,  entries: 1 } },
      { 'A': { n: 'A', ca: 800, entries: 2 } },
    )
    const d = diagnoseFec(raw, ['MC'])
    expect(d.companies).toBe(1)
    expect(d.clientsN).toBe(2)
    expect(d.clientsN1).toBe(1)
    expect(d.totalCA).toBe(2300)
    expect(d.totalFactures).toBe(5)
    expect(d.transactions).toBe(5)
  })

  it('retourne tout à 0 quand RAW est null', () => {
    const d = diagnoseFec(null, [])
    expect(d.companies).toBe(0)
    expect(d.clientsN).toBe(0)
    expect(d.transactions).toBe(0)
  })
})
