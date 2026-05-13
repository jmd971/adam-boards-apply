import { describe, it, expect } from 'vitest'
import { computeArticleStats } from '@/lib/articles'
import type { SaleTransaction } from '@/lib/rfm'

function tx(over: Partial<SaleTransaction>): SaleTransaction {
  return {
    client_key: 'c1', client_nom: 'Client',
    date_achat: '2026-05-01', montant: 100,
    ...over,
  }
}

describe('computeArticleStats', () => {
  it('retourne [] quand aucune transaction', () => {
    expect(computeArticleStats([])).toEqual([])
  })

  it('agrège par produit avec CA, nbVentes, nbClients uniques', () => {
    const txs: SaleTransaction[] = [
      tx({ produit: 'A', client_key: 'c1', montant: 100 }),
      tx({ produit: 'A', client_key: 'c2', montant: 200 }),
      tx({ produit: 'A', client_key: 'c1', montant: 50 }),
      tx({ produit: 'B', client_key: 'c1', montant: 300 }),
    ]
    const stats = computeArticleStats(txs)
    expect(stats).toHaveLength(2)

    const a = stats.find(s => s.produit === 'A')!
    expect(a.ca).toBe(350)
    expect(a.nbVentes).toBe(3)
    expect(a.nbClients).toBe(2)
    expect(a.prixMoyen).toBeCloseTo(350 / 3)
    expect(a.panierMoyen).toBe(175)

    const b = stats.find(s => s.produit === 'B')!
    expect(b.ca).toBe(300)
    expect(b.nbClients).toBe(1)
  })

  it('range les produits sans libellé sous "(sans libellé)"', () => {
    const stats = computeArticleStats([tx({ produit: undefined, montant: 50 })])
    expect(stats[0].produit).toBe('(sans libellé)')
  })

  it('trie par CA décroissant et calcule la part du CA total', () => {
    const txs: SaleTransaction[] = [
      tx({ produit: 'Petit',  montant: 100 }),
      tx({ produit: 'Gros',   montant: 700 }),
      tx({ produit: 'Moyen',  montant: 200 }),
    ]
    const stats = computeArticleStats(txs)
    expect(stats.map(s => s.produit)).toEqual(['Gros', 'Moyen', 'Petit'])
    expect(stats[0].partCA).toBeCloseTo(0.7)
    expect(stats[1].partCA).toBeCloseTo(0.2)
    expect(stats[2].partCA).toBeCloseTo(0.1)
  })

  it('détecte les articles mono-client (nbClients = 1)', () => {
    const txs: SaleTransaction[] = [
      tx({ produit: 'Mono',  client_key: 'c1', montant: 100 }),
      tx({ produit: 'Mono',  client_key: 'c1', montant: 100 }),
      tx({ produit: 'Multi', client_key: 'c1', montant: 100 }),
      tx({ produit: 'Multi', client_key: 'c2', montant: 100 }),
    ]
    const stats = computeArticleStats(txs)
    const mono = stats.filter(s => s.nbClients === 1).map(s => s.produit)
    expect(mono).toEqual(['Mono'])
  })
})
