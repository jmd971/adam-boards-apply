import { describe, it, expect } from 'vitest'
import { fecToSaleTransactions, diagnoseFec } from '@/lib/fecSales'
import type { RAWData, BilanAccount, FecEntry } from '@/types'

function acc(over: Partial<BilanAccount>): BilanAccount {
  return { s: 0, l: '', top: [], e: [], ...over }
}

function fecEntry(date: string, label: string, debit: number, credit: number, piece = 'F1'): FecEntry {
  return [date, label, debit, credit, piece, 0]
}

function buildRAW(bn: Record<string, BilanAccount>): RAWData {
  return {
    keys: ['MC'],
    mn: ['2026-01', '2026-02', '2026-03'],
    m1: ['2025-01', '2025-02'],
    m2: [],
    companies: {
      MC: {
        name: 'MC',
        pn: {}, p1: {}, p2: {}, bn, b1: {}, b2: {},
        bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
      },
    },
  } as any
}

describe('fecToSaleTransactions', () => {
  it('retourne [] quand RAW est null', () => {
    expect(fecToSaleTransactions(null, ['MC'])).toEqual([])
  })

  it('extrait les ventes depuis les sous-comptes 411xxx (libellé = nom client)', () => {
    const raw = buildRAW({
      '411DUPONT': acc({
        l: 'DUPONT SAS',
        e: [
          fecEntry('2026-01-15', 'Facture 2026-001', 1200, 0),
          fecEntry('2026-02-10', 'Facture 2026-002', 800,  0),
          fecEntry('2026-02-28', 'Règlement',        0,    1200),  // crédit = paiement, ignoré
        ],
      }),
      '411MARTIN': acc({
        l: 'MARTIN & Fils',
        e: [fecEntry('2026-03-05', 'Facture 2026-003', 500, 0)],
      }),
    })

    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(3)
    expect(txs.map(t => t.client_nom).sort()).toEqual(['DUPONT SAS', 'DUPONT SAS', 'MARTIN & Fils'])
    expect(txs.find(t => t.client_nom === 'MARTIN & Fils')?.montant).toBe(500)
    expect(txs.find(t => t.commande_ref === 'F1')?.date_achat).toBe('2026-01-15')
  })

  it('nettoie les préfixes "411XXX - " du libellé', () => {
    const raw = buildRAW({
      '411DUP': acc({
        l: '411DUP - DUPONT SAS',
        e: [fecEntry('2026-01-15', '', 100, 0)],
      }),
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs[0].client_nom).toBe('DUPONT SAS')
    expect(txs[0].client_key).toBe('dupont sas')
  })

  it('ignore les comptes 411 génériques sans top[]', () => {
    const raw = buildRAW({
      '411': acc({ l: 'Clients', e: [fecEntry('2026-01-15', 'Vente', 200, 0)] }),
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(0)   // pas de top[], pas de granularité client → on n'invente pas
  })

  it('utilise top[] pour les comptes 411 génériques quand dispo', () => {
    const raw = buildRAW({
      '411000': acc({
        l: 'Clients',
        top: [
          ['CDUP', 'DUPONT', 1500] as any,
          ['CMAR', 'MARTIN', 800]  as any,
        ],
        e: [],
      }),
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(2)
    expect(txs.map(t => t.client_nom).sort()).toEqual(['DUPONT', 'MARTIN'])
  })

  it('ne génère qu\'une transaction par débit (les crédits = paiements sont ignorés)', () => {
    const raw = buildRAW({
      '411DUP': acc({
        l: 'DUPONT',
        e: [
          fecEntry('2026-01-15', 'Fact', 100, 0),
          fecEntry('2026-01-20', 'Pmt',  0,   100),
          fecEntry('2026-02-15', 'Fact', 200, 0),
        ],
      }),
    })
    const txs = fecToSaleTransactions(raw, ['MC'])
    expect(txs).toHaveLength(2)
    expect(txs.reduce((s, t) => s + t.montant, 0)).toBe(300)
  })

  it('selCo vide = toutes les sociétés', () => {
    const raw = buildRAW({
      '411A': acc({ l: 'A', e: [fecEntry('2026-01-15', 'F', 100, 0)] }),
    })
    expect(fecToSaleTransactions(raw, []).length).toBe(1)
  })
})

describe('diagnoseFec', () => {
  it('compte les comptes et écritures correctement', () => {
    const raw = buildRAW({
      '411DUP':  acc({ l: 'DUPONT',  e: [
        fecEntry('2026-01-15', 'F', 100, 0),
        fecEntry('2026-02-15', 'P', 0, 100),
      ]}),
      '411MAR':  acc({ l: 'MARTIN',  e: [fecEntry('2026-03-15', 'F', 200, 0)] }),
      '411':     acc({ l: 'Clients', e: [fecEntry('2026-01-15', 'F', 50, 0)] }),
    })
    const d = diagnoseFec(raw, ['MC'])
    expect(d.companies).toBe(1)
    expect(d.comptes411).toBe(3)
    expect(d.comptesClients).toBe(2)
    expect(d.comptesGeneriques).toBe(1)
    expect(d.ecrituresDebit).toBe(3)
    expect(d.transactions).toBe(2)   // 411 générique sans top[] → 0
  })

  it('retourne tout à 0 quand RAW est null', () => {
    const d = diagnoseFec(null, [])
    expect(d.companies).toBe(0)
    expect(d.comptes411).toBe(0)
    expect(d.transactions).toBe(0)
  })
})
