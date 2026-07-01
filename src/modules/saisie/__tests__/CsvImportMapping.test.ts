import { describe, it, expect } from 'vitest'
import {
  parseCSVStructure,
  detectMapping,
  mappingToHeaders,
  headersToMapping,
  scoreSavedMapping,
  type FieldKey,
} from '@/modules/saisie/CsvImportView'

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

  it('en-tête introuvable → champ à -1, sans collision de colonne', () => {
    const struct = parseCSVStructure(VENTES)
    const saved: Partial<Record<FieldKey, string>> = { date: 'date', amount_ht: 'montant ht', tva_amount: 'montant tva' }
    const m = headersToMapping(saved, struct.headers)
    expect(m.date).toBeGreaterThanOrEqual(0)
    expect(m.amount_ht).toBeGreaterThanOrEqual(0)
    expect(m.tva_amount).toBe(-1) // colonne absente du fichier
  })
})
