import { describe, it, expect } from 'vitest'
import { parseFEC, detectPeriod, detectCompany, detectCompanyName } from '@/lib/fec'

/* ─── Fixture : minimal FEC standard (tab-separated) ─────────────────────── */

function buildFEC(rows: Array<{
  date: string; acc: string; lib?: string; debit?: number; credit?: number; journal?: string; ecLib?: string
}>): string {
  const header = ['JournalCode', 'EcritureDate', 'CompteNum', 'CompteLib', 'EcritureLib', 'Debit', 'Credit'].join('\t')
  const body = rows.map(r => [
    r.journal ?? 'VTE',
    r.date,
    r.acc,
    r.lib ?? '',
    r.ecLib ?? '',
    String(r.debit ?? 0),
    String(r.credit ?? 0),
  ].join('\t'))
  return [header, ...body].join('\n')
}

/* ─── parseFEC ──────────────────────────────────────────────────────────── */

describe('parseFEC', () => {
  it('renvoie null pour un fichier vide ou trop court', () => {
    expect(parseFEC('')).toBeNull()
    expect(parseFEC('JournalCode\tEcritureDate')).toBeNull()
  })

  it('parse un FEC tab-separated minimal', () => {
    const text = buildFEC([
      { date: '20260115', acc: '707',  lib: 'Ventes',  credit: 1000 },
      { date: '20260115', acc: '411',  lib: 'Clients', debit: 1000 },
    ])
    const r = parseFEC(text)
    expect(r).not.toBeNull()
    expect(r!.entryCount).toBe(1)  // seuls les comptes 6 et 7 sont comptés en entryCount
    expect(r!.months).toContain('2026-01')
  })

  it('range les comptes 7xx dans plData avec la convention mo[month] = [debit, credit]', () => {
    const text = buildFEC([
      { date: '20260115', acc: '707', credit: 1000, lib: 'Ventes' },
      { date: '20260220', acc: '707', credit: 2000, lib: 'Ventes' },
    ])
    const r = parseFEC(text)!
    expect(r.plData['707']).toBeDefined()
    expect(r.plData['707'].mo['2026-01']).toEqual([0, 1000])
    expect(r.plData['707'].mo['2026-02']).toEqual([0, 2000])
  })

  it('range les comptes 6xx dans plData (convention charge)', () => {
    const text = buildFEC([
      { date: '20260115', acc: '607', debit: 500, lib: 'Achats' },
    ])
    const r = parseFEC(text)!
    expect(r.plData['607']).toBeDefined()
    expect(r.plData['607'].mo['2026-01']).toEqual([500, 0])
  })

  it('range les comptes bilan (1-5) dans bilanData', () => {
    // Le parseur exige au moins une écriture classe 6/7 — sinon il retourne null
    // (un vrai FEC en a forcément). On en met une de complaisance pour valider le routage bilan.
    const text = buildFEC([
      { date: '20260115', acc: '707', credit: 1200, lib: 'Ventes' },  // pour ne pas être null
      { date: '20260115', acc: '411', debit: 1200, lib: 'Clients' },
      { date: '20260115', acc: '512', credit: 1200, lib: 'Banque' },
    ])
    const r = parseFEC(text)!
    expect(r.bilanData['411']).toBeDefined()
    expect(r.bilanData['512']).toBeDefined()
    expect(r.plData['707']).toBeDefined()
    // entryCount ne compte que classe 6/7
    expect(r.entryCount).toBe(1)
  })

  it('renvoie null si aucune écriture classe 6/7 (FEC dégradé/inutilisable)', () => {
    const text = buildFEC([
      { date: '20260115', acc: '411', debit: 1200 },
      { date: '20260115', acc: '512', credit: 1200 },
    ])
    expect(parseFEC(text)).toBeNull()
  })

  it('cumule les écritures sur le même mois (debit/credit additionnés)', () => {
    const text = buildFEC([
      { date: '20260115', acc: '707', credit: 1000 },
      { date: '20260125', acc: '707', credit: 500 },
    ])
    const r = parseFEC(text)!
    expect(r.plData['707'].mo['2026-01']).toEqual([0, 1500])
  })

  it('skippe les lignes où debit=0 ET credit=0', () => {
    const text = buildFEC([
      { date: '20260115', acc: '707', credit: 1000 },
      { date: '20260116', acc: '707', credit: 0, debit: 0 },  // skip
      { date: '20260117', acc: '707', credit: 500 },
    ])
    const r = parseFEC(text)!
    expect(r.skippedLines).toBeGreaterThanOrEqual(1)
    expect(r.plData['707'].mo['2026-01']).toEqual([0, 1500])
  })

  it('skippe les comptes invalides (lettres, vide, trop court)', () => {
    const text = buildFEC([
      { date: '20260115', acc: '707', credit: 1000 },
      { date: '20260115', acc: 'ABC', credit: 100 },  // invalide
      { date: '20260115', acc: '',    credit: 100 },  // vide
    ])
    const r = parseFEC(text)!
    expect(r.skippedLines).toBeGreaterThanOrEqual(2)
    expect(r.plData['ABC']).toBeUndefined()
  })

  it('détecte le séparateur point-virgule au lieu de tab', () => {
    const text = [
      'JournalCode;EcritureDate;CompteNum;CompteLib;EcritureLib;Debit;Credit',
      'VTE;20260115;707;Ventes;;0;1000',
    ].join('\n')
    const r = parseFEC(text)!
    expect(r.plData['707'].mo['2026-01']).toEqual([0, 1000])
  })

  it('stocke les écritures détaillées dans plData[acc].e', () => {
    const text = buildFEC([
      { date: '20260115', acc: '707', credit: 1000, ecLib: 'F-2026-001' },
      { date: '20260116', acc: '707', credit: 500,  ecLib: 'F-2026-002' },
    ])
    const r = parseFEC(text)!
    expect(r.plData['707'].e).toHaveLength(2)
    // L'entrée a la structure [date, libellé, débit, crédit, pièce, isOD]
    expect(r.plData['707'].e[0][2]).toBe(0)   // debit
    expect(r.plData['707'].e[0][3]).toBe(1000) // credit
  })
})

/* ─── detectPeriod / detectCompany / detectCompanyName ────────────────────── */

describe('detectPeriod', () => {
  it('mois max = année courante → period N', () => {
    const cy = new Date().getFullYear()
    const r = detectPeriod([`${cy}-01`, `${cy}-06`])
    expect(r.period).toBe('N')
    expect(r.fy).toBe(String(cy))
  })

  it('mois max < année courante → period N-1 (la cause du bug du jour)', () => {
    const cy = new Date().getFullYear()
    const prev = cy - 1
    const r = detectPeriod([`${prev}-01`, `${prev}-12`])
    expect(r.period).toBe('N-1')
    expect(r.fy).toBe(String(prev))
  })

  it('months vide → period N, fy = année courante', () => {
    const r = detectPeriod([])
    expect(r.period).toBe('N')
    expect(r.fy).toBe(String(new Date().getFullYear()))
  })
})

describe('detectCompany / detectCompanyName', () => {
  it('strip l\'extension .txt et .csv', () => {
    expect(detectCompany('MA_SOCIETE.txt')).not.toContain('.txt')
    expect(detectCompany('MA_SOCIETE.csv')).not.toContain('.csv')
  })

  it('retire le suffixe _N-1 ou _N (marqueurs de période)', () => {
    expect(detectCompany('SCI_2025_N-1.txt')).not.toContain('N-1')
    expect(detectCompany('SCI_N.txt')).toBe('SCI')
  })

  it('passe en MAJUSCULES', () => {
    expect(detectCompany('sci_paris.txt')).toBe('SCI_PARIS')
  })

  it('detectCompanyName : strip "FEC" en début et l\'année en fin', () => {
    expect(detectCompanyName('FEC_SCI_PARIS_2025.txt')).toBe('SCI_PARIS')
  })

  it("fallback 'SOCIETE' si nom vide", () => {
    expect(detectCompany('.txt')).toBe('SOCIETE')
    expect(detectCompanyName('.txt')).toBe('SOCIETE')
  })
})
