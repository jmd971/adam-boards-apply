import { describe, it, expect } from 'vitest'
import { computeRFM, manualEntriesToTransactions, type SaleTransaction } from '@/lib/rfm'
import type { ManualEntry } from '@/types'

const REF_DATE = new Date('2026-05-13')

function tx(over: Partial<SaleTransaction>): SaleTransaction {
  return {
    client_key: 'dupont',
    client_nom: 'Dupont',
    date_achat: '2026-05-01',
    montant: 100,
    commande_ref: 'F-1',
    ...over,
  }
}

/* ─── computeRFM ─────────────────────────────────────────────────────────── */

describe('computeRFM', () => {
  it('renvoie un tableau vide si aucune transaction', () => {
    expect(computeRFM([], REF_DATE)).toEqual([])
  })

  it('agrège les transactions par client_key', () => {
    const r = computeRFM([
      tx({ client_key: 'a', client_nom: 'Alice',   montant: 100, commande_ref: 'F1' }),
      tx({ client_key: 'a', client_nom: 'Alice',   montant: 200, commande_ref: 'F2' }),
      tx({ client_key: 'b', client_nom: 'Bob',     montant: 50,  commande_ref: 'F3' }),
    ], REF_DATE)

    expect(r).toHaveLength(2)
    const alice = r.find(c => c.key === 'a')!
    expect(alice.ca).toBe(300)
    expect(alice.nbVisites).toBe(2)
  })

  it('tri par CA décroissant', () => {
    const r = computeRFM([
      tx({ client_key: 'small',  montant: 10 }),
      tx({ client_key: 'big',    montant: 1000 }),
      tx({ client_key: 'medium', montant: 100 }),
    ], REF_DATE)
    expect(r.map(c => c.key)).toEqual(['big', 'medium', 'small'])
  })

  it('calcule daysSinceLast par rapport à la refDate', () => {
    const r = computeRFM([
      tx({ client_key: 'recent', date_achat: '2026-05-10' }),  // 3j
      tx({ client_key: 'old',    date_achat: '2025-05-13' }),  // 365j
    ], REF_DATE)
    expect(r.find(c => c.key === 'recent')!.daysSinceLast).toBe(3)
    expect(r.find(c => c.key === 'old')!.daysSinceLast).toBeGreaterThanOrEqual(365)
  })

  it('compte les visites par commande_ref unique (pas par ligne)', () => {
    // 3 lignes pour le même panier (F-1) = 1 visite, pas 3
    const r = computeRFM([
      tx({ client_key: 'a', commande_ref: 'F-1', montant: 50 }),
      tx({ client_key: 'a', commande_ref: 'F-1', montant: 30 }),
      tx({ client_key: 'a', commande_ref: 'F-1', montant: 20 }),
    ], REF_DATE)
    expect(r[0].nbVisites).toBe(1)
    expect(r[0].ca).toBe(100)
  })

  it('segment "champion": R>=3 (≤90j) + F>=3 (>=4 visites) + M>=3', () => {
    // Crée 5 clients dont 1 champion + 4 autres pour avoir des quartiles
    const txs: SaleTransaction[] = [
      // CHAMPION : récent, 5 visites, gros panier
      tx({ client_key: 'champ', date_achat: '2026-05-10', commande_ref: 'F-c1', montant: 5_000 }),
      tx({ client_key: 'champ', date_achat: '2026-04-10', commande_ref: 'F-c2', montant: 5_000 }),
      tx({ client_key: 'champ', date_achat: '2026-03-10', commande_ref: 'F-c3', montant: 5_000 }),
      tx({ client_key: 'champ', date_achat: '2026-02-10', commande_ref: 'F-c4', montant: 5_000 }),
      // 4 petits clients pour les quartiles
      tx({ client_key: 'p1', date_achat: '2026-05-12', commande_ref: 'p1', montant: 10 }),
      tx({ client_key: 'p2', date_achat: '2026-05-12', commande_ref: 'p2', montant: 20 }),
      tx({ client_key: 'p3', date_achat: '2026-05-12', commande_ref: 'p3', montant: 30 }),
      tx({ client_key: 'p4', date_achat: '2026-05-12', commande_ref: 'p4', montant: 40 }),
    ]
    const r = computeRFM(txs, REF_DATE)
    const champ = r.find(c => c.key === 'champ')!
    expect(champ.segment).toBe('champion')
  })

  it('segment "one_shot": F=1 (1 seule visite), quelle que soit R et M', () => {
    const r = computeRFM([
      tx({ client_key: 'oneShot', date_achat: '2026-05-12', montant: 1000, commande_ref: 'F-os' }),
      tx({ client_key: 'other',   date_achat: '2026-05-12', montant: 10,   commande_ref: 'F-o' }),
    ], REF_DATE)
    expect(r.find(c => c.key === 'oneShot')!.segment).toBe('one_shot')
  })

  it('segment "a_risque": F>=3, R<=2 (>90j d\'inactivité), M faible', () => {
    // Le client "risk" : 4 visites mais dernière à 5+ mois, panier petit
    // (l'algo classify met fidèle si m>=2 → on doit assurer m=1 pour atteindre a_risque)
    const txs: SaleTransaction[] = [
      tx({ client_key: 'risk', date_achat: '2025-12-13', commande_ref: 'r1', montant: 10 }),
      tx({ client_key: 'risk', date_achat: '2025-11-13', commande_ref: 'r2', montant: 10 }),
      tx({ client_key: 'risk', date_achat: '2025-10-13', commande_ref: 'r3', montant: 10 }),
      tx({ client_key: 'risk', date_achat: '2025-09-13', commande_ref: 'r4', montant: 20 }),
      // Trois autres clients plus riches → risk se retrouve dans le quartile bas (M=1)
      tx({ client_key: 'rich1', date_achat: '2026-05-12', commande_ref: 'b1', montant: 1_000 }),
      tx({ client_key: 'rich2', date_achat: '2026-05-12', commande_ref: 'b2', montant: 2_000 }),
      tx({ client_key: 'rich3', date_achat: '2026-05-12', commande_ref: 'b3', montant: 3_000 }),
    ]
    const r = computeRFM(txs, REF_DATE)
    expect(r.find(c => c.key === 'risk')!.segment).toBe('a_risque')
  })

  it('utilise refDate au lieu de Date.now() pour la reproductibilité', () => {
    // Test : avec refDate fixe, deux runs donnent le même résultat
    const txs = [tx({ date_achat: '2026-01-01' })]
    const r1 = computeRFM(txs, new Date('2026-05-13'))
    const r2 = computeRFM(txs, new Date('2026-05-13'))
    expect(r1[0].daysSinceLast).toBe(r2[0].daysSinceLast)
    // 2026-01-01 → 2026-05-13 = 132 j
    expect(r1[0].daysSinceLast).toBe(132)
  })
})

/* ─── manualEntriesToTransactions ────────────────────────────────────────── */

function entry(over: Partial<ManualEntry>): ManualEntry {
  return {
    id: 'e1',
    tenant_id: 't',
    company_key: 'MC',
    entry_date: '2026-05-01',
    amount_ttc: '120',
    amount_ht: '100',
    category: 'Vente',
    subcategory: 'Prestations',
    counterpart: 'Mr Dupont',
    source: 'manual',
    created_at: '2026-05-01T00:00:00Z',
    ...over,
  }
}

describe('manualEntriesToTransactions', () => {
  it('ne garde que category="Vente"', () => {
    const r = manualEntriesToTransactions([
      entry({ id: 'v', category: 'Vente' }),
      entry({ id: 'a', category: 'Achat' }),
      entry({ id: 'd', category: 'Depense' }),
    ], ['MC'])
    expect(r).toHaveLength(1)
    expect(r[0].commande_ref).toBe('v')
  })

  it('exclut les ventes sans counterpart (nom client requis)', () => {
    const r = manualEntriesToTransactions([
      entry({ id: 'good', counterpart: 'Dupont' }),
      entry({ id: 'nullCpt', counterpart: undefined }),
      entry({ id: 'emptyCpt', counterpart: '   ' }),
    ], ['MC'])
    expect(r).toHaveLength(1)
    expect(r[0].commande_ref).toBe('good')
  })

  it('exclut les ventes sans entry_date', () => {
    const r = manualEntriesToTransactions([
      entry({ id: 'ok',  entry_date: '2026-05-01' }),
      entry({ id: 'nok', entry_date: '' }),
    ], ['MC'])
    expect(r).toHaveLength(1)
  })

  it('filtre par selCo (sociétés sélectionnées)', () => {
    const r = manualEntriesToTransactions([
      entry({ id: 'mc', company_key: 'MC' }),
      entry({ id: 'pp', company_key: 'PP' }),
    ], ['MC'])
    expect(r).toHaveLength(1)
    expect(r[0].commande_ref).toBe('mc')
  })

  it('selCo vide = pas de filtre société', () => {
    const r = manualEntriesToTransactions([
      entry({ id: 'mc', company_key: 'MC' }),
      entry({ id: 'pp', company_key: 'PP' }),
    ], [])
    expect(r).toHaveLength(2)
  })

  it('utilise amount_ht_saisie en priorité, puis amount_ht, puis amount_ttc', () => {
    const r = manualEntriesToTransactions([
      entry({ id: '1', amount_ht_saisie: '111', amount_ht: '222', amount_ttc: '333' }),
      entry({ id: '2', amount_ht_saisie: undefined, amount_ht: '222', amount_ttc: '333' }),
      entry({ id: '3', amount_ht_saisie: undefined, amount_ht: undefined, amount_ttc: '333' }),
    ], ['MC'])
    expect(r[0].montant).toBe(111)
    expect(r[1].montant).toBe(222)
    expect(r[2].montant).toBe(333)
  })

  it('normalise client_key en lowercase trimé', () => {
    const r = manualEntriesToTransactions([
      entry({ counterpart: '  Mr DUPONT  ' }),
    ], ['MC'])
    expect(r[0].client_key).toBe('mr dupont')
    expect(r[0].client_nom).toBe('Mr DUPONT')
  })
})
