import { describe, it, expect } from 'vitest'
import {
  parseCSVStructure,
  detectMapping,
  applyMapping,
  mappingToHeaders,
  headersToMapping,
  scoreSavedMapping,
  type FieldKey,
} from '@/modules/saisie/CsvImportView'
import { extractAcc } from '@/lib/categories'

// Fichier « Ventes » : Date, Montant HT, Libellé, Client
const VENTES = 'Date;Montant HT;Libelle;Client\n01/02/2026;100;Presta;ACME\n'
// Même société, colonnes RÉORDONNÉES → un mapping par nom d'en-tête doit suivre
const VENTES_REORDER = 'Client;Libelle;Date;Montant HT\nACME;Presta;01/02/2026;100\n'
// Fichier « Achats » : structure différente
const ACHATS = 'Date facture;Fournisseur;Total HT\n03/02/2026;OVH;50\n'

describe('mappings CSV enregistrés — aller-retour par nom d’en-tête', () => {
  it('mappingToHeaders puis headersToMapping redonne les mêmes index (colonnes stables)', () => {
    const struct = parseCSVStructure(VENTES)
    const m = detectMapping(struct.headers)
    const saved = mappingToHeaders(m, struct.headers)
    // Les champs mappés sont stockés par en-tête normalisé
    expect(saved.date).toBe('date')
    expect(saved.amount_ht).toBe('montant ht')
    // Ré-application sur le même fichier → index identiques
    expect(headersToMapping(saved, struct.headers)).toEqual(m)
  })

  it('résout correctement même quand les colonnes sont réordonnées', () => {
    const s1 = parseCSVStructure(VENTES)
    const saved = mappingToHeaders(detectMapping(s1.headers), s1.headers)

    const s2 = parseCSVStructure(VENTES_REORDER)
    const m2 = headersToMapping(saved, s2.headers)
    // Date est en dernière position d'en-tête dans le fichier réordonné (index 2)
    expect(s2.headers[m2.date]).toBe('date')
    expect(s2.headers[m2.amount_ht]).toBe('montant ht')
  })

  it('scoreSavedMapping : -1 si un champ obligatoire manque, sinon nb de champs résolus', () => {
    const sVentes = parseCSVStructure(VENTES)
    const saved = mappingToHeaders(detectMapping(sVentes.headers), sVentes.headers)

    // Sur le fichier Ventes : tous les champs obligatoires présents → score > 0
    expect(scoreSavedMapping(saved, sVentes.headers)).toBeGreaterThan(0)
    // Sur le fichier Achats (pas de « montant ht ») → obligatoire manquant → -1
    const sAchats = parseCSVStructure(ACHATS)
    expect(scoreSavedMapping(saved, sAchats.headers)).toBe(-1)
  })

  it('applyMapping : la catégorie du profil (defaultCategory) force la catégorie des lignes', () => {
    // Fichier avec une colonne « nature » qui détecterait Achat…
    const withNature = 'Date;Montant HT;Nature\n15/03/2026;100;Achat fournisseur\n'
    const struct = parseCSVStructure(withNature)
    const m = detectMapping(struct.headers)

    // …sans profil : la nature est détectée (Achat)
    expect(applyMapping(struct, m)[0].category).toBe('Achat')
    // …avec profil « Vente » : toutes les lignes reprennent la catégorie du profil
    const rows = applyMapping(struct, m, 'Vente')
    expect(rows.every(r => r.category === 'Vente')).toBe(true)
  })

  it('en-tête introuvable → champ à -1, sans collision de colonne', () => {
    const struct = parseCSVStructure(VENTES)
    const saved: Partial<Record<FieldKey, string>> = { date: 'date', amount_ht: 'montant ht', tva_amount: 'montant tva' }
    const m = headersToMapping(saved, struct.headers)
    expect(m.date).toBeGreaterThanOrEqual(0)
    expect(m.amount_ht).toBeGreaterThanOrEqual(0)
    expect(m.tva_amount).toBe(-1) // colonne absente du fichier
  })
})

// ─── Export « Dépenses » Axonaut (colonnes réelles du logiciel) ───────────────
const AXONAUT =
  'Date de la dépense;Numéro de la dépense;Type de dépense;Code comptable du type de la dépense;Nom du fournisseur;Compte de tiers du fournisseur;Titre de la dépense (si dépense associée);Montant HT;Montant TTC;Date de paiement;Reste TTC\n' +
  '13/07/2026;2607-010;Foires et expositions;6233;SARL PEPE SERVICE;401221;;20;20;15/07/2026;0\n' +
  '11/07/2026;2607-008;Foires et expositions;6233;Merne Millette;401218;004066;0;0;;0\n' +
  '07/05/2026;2605-010;Foires et expositions;6233;DESTRELLAN;401110;;3 120,00;3385,2;03/06/2026;0\n'

describe('format Axonaut (export Dépenses)', () => {
  it('auto-détecte les bonnes colonnes : nom du fournisseur (pas le compte de tiers), code comptable, date de paiement', () => {
    const s = parseCSVStructure(AXONAUT)
    const m = detectMapping(s.headers)
    expect(s.headers[m.date]).toBe('date de la depense')
    expect(s.headers[m.amount_ht]).toBe('montant ht')
    expect(s.headers[m.amount_ttc]).toBe('montant ttc')
    expect(s.headers[m.counterpart]).toBe('nom du fournisseur')          // PAS « compte de tiers… »
    expect(s.headers[m.subcategory]).toBe('code comptable du type de la depense')
    expect(s.headers[m.payment_date]).toBe('date de paiement')
    expect(s.headers[m.invoice_number]).toBe('numero de la depense')
  })

  it('décoche automatiquement les lignes à 0 € (elles faisaient échouer l\'insert du lot)', () => {
    const s = parseCSVStructure(AXONAUT)
    const rows = applyMapping(s, detectMapping(s.headers))
    expect(rows[0].selected).toBe(true)   // 20 €
    expect(rows[1].selected).toBe(false)  // 0 €
  })

  it('parse les montants à séparateur de milliers (« 3 120,00 » → 3120)', () => {
    const s = parseCSVStructure(AXONAUT)
    const rows = applyMapping(s, detectMapping(s.headers))
    expect(rows[2].amount_ht).toBe(3120)
    expect(rows[2].amount_ttc).toBe(3385.2)
  })

  it('extractAcc : code comptable brut → compte ; parenthèses prioritaires ; texte/court → fallback', () => {
    expect(extractAcc('6233', '626')).toBe('6233')            // code brut Axonaut
    expect(extractAcc('Publicité (623)', '626')).toBe('623')  // format historique inchangé
    expect(extractAcc('6', '626')).toBe('626')                // trop court → fallback
    expect(extractAcc('', '626')).toBe('626')                 // vide → fallback
    expect(extractAcc('Frais divers', '658')).toBe('658')     // texte libre → fallback
  })
})
