import { describe, it, expect } from 'vitest'
import { isTreasuryAccount, cashCategoryOf, vatRateForAccount } from '@/lib/tresoCats'
import { parseFEC } from '@/lib/fec'

// ─── Helpers tresoCats ──────────────────────────────────────────────────────

describe('isTreasuryAccount', () => {
  it('détecte les comptes de trésorerie (classe 5 : banque, caisse)', () => {
    expect(isTreasuryAccount('512')).toBe(true)
    expect(isTreasuryAccount('5121')).toBe(true)
    expect(isTreasuryAccount('511')).toBe(true)   // valeurs à l'encaissement
    expect(isTreasuryAccount('514')).toBe(true)   // chèques postaux
    expect(isTreasuryAccount('530')).toBe(true)   // caisse
    expect(isTreasuryAccount('540')).toBe(true)   // régies d'avances
  })
  it('rejette les comptes non-trésorerie', () => {
    expect(isTreasuryAccount('518')).toBe(false)  // intérêts courus
    expect(isTreasuryAccount('607')).toBe(false)
    expect(isTreasuryAccount('411DIVERS')).toBe(false)
    expect(isTreasuryAccount('401EDF')).toBe(false)
  })
})

describe('cashCategoryOf', () => {
  it('catégorise via le compte P&L (direct ou résolu par lettrage)', () => {
    expect(cashCategoryOf('411X', '707')).toBe('Ventes marchandises')
    expect(cashCategoryOf('411X', '706')).toBe('Ventes prestations')
    expect(cashCategoryOf('401Y', '607')).toBe('Achats marchandises')
  })
  it('catégorise les contreparties tiers en générique', () => {
    expect(cashCategoryOf('411DIVERS', null)).toBe('Encaissements clients')
    expect(cashCategoryOf('401EDF', null)).toBe('Décaissements fournisseurs')
    expect(cashCategoryOf('421', null)).toBe('Salaires')
    expect(cashCategoryOf('431', null)).toBe('Charges sociales')
    expect(cashCategoryOf('44551', null)).toBe('TVA & État')
    expect(cashCategoryOf('455', null)).toBe("Comptes d'associés")
  })
})

describe('vatRateForAccount', () => {
  it('retourne 0 si la société n’est pas assujettie', () => {
    expect(vatRateForAccount('707', { enabled: false, rates: { 'Ventes marchandises': 20 } })).toBe(0)
    expect(vatRateForAccount('707', undefined)).toBe(0)
  })
  it('retourne le taux de la catégorie si assujettie', () => {
    expect(vatRateForAccount('707', { enabled: true, rates: { 'Ventes marchandises': 5.5 } })).toBe(5.5)
    expect(vatRateForAccount('706', { enabled: true, rates: { 'Ventes prestations': 20 } })).toBe(20)
    expect(vatRateForAccount('707', { enabled: true, rates: {} })).toBe(0)  // catégorie sans taux
  })
})

// ─── Reconstruction des mouvements de trésorerie (parseFEC → cashMoves) ──────

const FEC = [
  'JournalCode;EcritureDate;CompteNum;CompteLib;PieceRef;EcritureLib;Debit;Credit;Lettrage',
  // Facture de vente (établit le lien lettrage L1 → compte 707)
  'VE;2026-01-05;411CLIENT;Client X;V1;Vente;1200;0;L1',
  'VE;2026-01-05;707;Ventes marchandises;V1;Vente;0;1000;',
  'VE;2026-01-05;44571;TVA collectée;V1;Vente;0;200;',
  // Encaissement client (banque + 411 lettré L1 → catégorie via lettrage)
  'BP;2026-01-20;512;Banque;P1;Encaissement client;1200;0;',
  'BP;2026-01-20;411CLIENT;Client X;P1;Encaissement client;0;1200;L1',
  // Paiement fournisseur (tiers générique, pas de lettrage)
  'BP;2026-01-22;512;Banque;P2;Paiement fournisseur;0;500;',
  'BP;2026-01-22;401FOURN;Fournisseur Y;P2;Paiement fournisseur;500;0;',
  // Frais bancaires (contrepartie P&L directe 627)
  'BP;2026-01-25;512;Banque;P3;Frais bancaires;0;10;',
  'BP;2026-01-25;627;Services bancaires;P3;Frais bancaires;10;0;',
  // Virement interne (100% trésorerie → ignoré)
  'BP;2026-01-28;512;Banque;P4;Virement interne;100;0;',
  'BP;2026-01-28;530;Caisse;P4;Virement interne;0;100;',
  // À-nouveaux (solde d’ouverture → ignoré)
  '[AN];2026-01-01;512;Banque;AN1;A nouveau;5000;0;',
].join('\n')

describe('parseFEC → cashMoves', () => {
  const parsed = parseFEC(FEC)

  it('parse le FEC (présence de classe 6/7)', () => {
    expect(parsed).not.toBeNull()
  })

  it('reconstruit les mouvements de trésorerie réels (TTC)', () => {
    const moves = parsed!.cashMoves
    const enc = moves.filter(m => m.dir === 'enc')
    const dec = moves.filter(m => m.dir === 'dec')
    // 3 mouvements : 1 encaissement + 2 décaissements (virement interne et AN exclus)
    expect(moves.length).toBe(3)
    expect(enc.reduce((s, m) => s + m.amount, 0)).toBe(1200)
    expect(dec.reduce((s, m) => s + m.amount, 0)).toBe(510)
  })

  it('catégorise l’encaissement client via le lettrage (411 → 707)', () => {
    const enc = parsed!.cashMoves.find(m => m.dir === 'enc')
    expect(enc?.counterpart).toBe('411CLIENT')
    expect(enc?.category).toBe('Ventes marchandises')
    expect(enc?.amount).toBe(1200)
  })

  it('catégorise le paiement fournisseur en générique (pas de lettrage)', () => {
    const m = parsed!.cashMoves.find(x => x.counterpart === '401FOURN')
    expect(m?.dir).toBe('dec')
    expect(m?.category).toBe('Décaissements fournisseurs')
  })

  it('catégorise les frais bancaires via la contrepartie P&L (627)', () => {
    const m = parsed!.cashMoves.find(x => x.counterpart === '627')
    expect(m?.category).toBe('Services extérieurs')
  })

  it('exclut les virements internes et les à-nouveaux', () => {
    const moves = parsed!.cashMoves
    expect(moves.some(m => m.piece === 'P4')).toBe(false)        // virement interne
    expect(moves.some(m => m.date === '2026-01-01')).toBe(false) // à-nouveaux
  })
})
