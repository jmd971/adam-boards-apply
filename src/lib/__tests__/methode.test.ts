import { describe, it, expect } from 'vitest'
import { buildMethodeRapport, tiersFromLabel, classifyFreq } from '@/lib/methode'
import type { RAWData, FecAccount, FecEntry } from '@/types'

// ── Fabriques ────────────────────────────────────────────────────────────────

/** Compte FEC depuis une liste d'écritures [date, libellé, débit, crédit, pièce] ; mo dérivé. */
function fa(l: string, entries: [string, string, number, number, string][]): FecAccount {
  const mo: Record<string, [number, number]> = {}
  const e: FecEntry[] = []
  for (const [date, label, d, c, piece] of entries) {
    const m = date.slice(0, 7)
    mo[m] = mo[m] ?? [0, 0]
    mo[m][0] += d; mo[m][1] += c
    e.push([date, label, d, c, piece, 0])
  }
  return { l, mo, e }
}

const months = (y: number, upto: number) =>
  Array.from({ length: upto }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)

// Société TEST, exercice civil. N = jan→mai 2026 ; N-1 = 2025 complet.
//  706  Prestations : abonnement DUPONT 500 €/mois (tiers via contrepartie 411DUP)
//                     → 12 mois en 2025, mais s'arrête en avril 2026 (mai manquant)
//  6226 Honoraires  : « CABINET AUDITEX/HONORAIRES » 500 €/mois — conforme
//  613  Loyer       : 1000 €/mois en 2025 → 1300 €/mois en 2026 — montant anormal
//  607  Achats      : « BRICOTRUC/MATERIEL CHANTIER » 800 € en mars 2026 — nouveau
//  681  Dotations   : compte OD → jamais d'attendus
function makeRAW(): RAWData {
  const dupontN1: [string, string, number, number, string][] = months(2025, 12)
    .map((m, i) => [`${m}-10`, 'ABONNEMENT MENSUEL', 0, 500, `F25-${i + 1}`])
  const dupontN: [string, string, number, number, string][] = months(2026, 4)
    .map((m, i) => [`${m}-10`, 'ABONNEMENT MENSUEL', 0, 500, `F26-${i + 1}`])
  const honoraires = (y: number, n: number, pfx: string): [string, string, number, number, string][] =>
    months(y, n).map((m, i) => [`${m}-05`, 'CABINET AUDITEX/HONORAIRES', 500, 0, `${pfx}${i + 1}`])
  const loyer = (y: number, n: number, amt: number): [string, string, number, number, string][] =>
    months(y, n).map((m, i) => [`${m}-02`, 'LOYER BUREAUX', amt, 0, `L${y}-${i + 1}`])

  // Contrepartie : sous-compte client 411DUP, mêmes pièces / mêmes dates (montants TTC)
  const bilan411 = fa('DUPONT SARL', [
    ...months(2025, 12).map((m, i) => [`${m}-10`, 'ABONNEMENT MENSUEL', 600, 0, `F25-${i + 1}`] as [string, string, number, number, string]),
    ...months(2026, 4).map((m, i) => [`${m}-10`, 'ABONNEMENT MENSUEL', 600, 0, `F26-${i + 1}`] as [string, string, number, number, string]),
  ])

  return {
    keys: ['TEST'],
    mn: months(2026, 5),
    m1: months(2025, 12),
    m2: [],
    companies: {
      TEST: {
        name: 'Société Test', p2: {}, b2: {}, cdN: {}, cdN1: {}, veN: [], veN1: [], bud: {},
        pn: {
          '706':  fa('Prestations de services', dupontN),
          '6226': fa('Honoraires', honoraires(2026, 5, 'H26-')),
          '613':  fa('Locations', loyer(2026, 5, 1300)),
          '607':  fa('Achats de marchandises', [['2026-03-12', 'BRICOTRUC/MATERIEL CHANTIER', 800, 0, 'A26-1']]),
          '681':  fa('Dotations amortissements', [['2026-05-31', 'DOTATION MAI', 200, 0, 'OD-1']]),
        },
        p1: {
          '706':  fa('Prestations de services', dupontN1),
          '6226': fa('Honoraires', honoraires(2025, 12, 'H25-')),
          '613':  fa('Locations', loyer(2025, 12, 1000)),
        },
        bn: { '411DUP': bilan411 },
        b1: {},
      } as any,
    },
  } as RAWData
}

const TODAY = new Date('2026-06-15')
const build = () => buildMethodeRapport(makeRAW(), { TEST: 1 }, 'TEST', { today: TODAY })!

// ── Tests ────────────────────────────────────────────────────────────────────

describe('tiersFromLabel — extraction du tiers depuis le libellé', () => {
  it('détecte le motif CLIENT X', () => {
    expect(tiersFromLabel('FACT MC00001 - CLIENT JUPITER')).toEqual({ tiers: 'JUPITER', conf: 2 })
  })
  it('détecte le préfixe TIERS/…', () => {
    expect(tiersFromLabel('AGRODYL/MONTAGE DOSSIER DE SUBVENTION')).toEqual({ tiers: 'AGRODYL', conf: 2 })
  })
  it('regroupe par mots significatifs sinon', () => {
    const r = tiersFromLabel('LOYER BUREAUX JUIN')
    expect(r.conf).toBe(3)
    expect(r.tiers).toContain('BUREAUX')
  })
})

describe('classifyFreq — fréquence depuis les dates', () => {
  it('mensuel', () => {
    expect(classifyFreq(months(2025, 12).map(m => `${m}-10`))).toBe('mensuel')
  })
  it('trimestriel', () => {
    expect(classifyFreq(['2025-01-15', '2025-04-15', '2025-07-15', '2025-10-15'])).toBe('trimestriel')
  })
  it('irrégulier si trop peu de dates', () => {
    expect(classifyFreq(['2025-01-15'])).toBe('irregulier')
  })
})

describe('buildMethodeRapport — cadrage (étape 1)', () => {
  it('résultat N et N-1 à même période (jan→mai)', () => {
    const r = build()
    expect(r.nbMois).toBe(5)
    expect(r.periodeComplete).toBe(false)
    // N : 706=2000 − (6226 2500 + 613 6500 + 607 800 + 681 200) = −8000
    expect(Math.round(r.resultatN)).toBe(2000 - 2500 - 6500 - 800 - 200)
    // N-1 même période : 706=2500 − (6226 2500 + 613 5000) = −5000
    expect(Math.round(r.resultatN1)).toBe(2500 - 2500 - 5000)
  })
})

describe('buildMethodeRapport — verdicts (étapes 2-4)', () => {
  const findGroupe = (fam: 'produits' | 'charges', acc: string) => {
    const r = build()
    const f = r[fam].find(f2 => f2.comptes.some(c => c.account === acc))!
    return f.comptes.find(c => c.account === acc)!
  }

  it('manquant : l\'abonnement DUPONT s\'arrête (4 mois au lieu de 5)', () => {
    const c = findGroupe('produits', '706')
    expect(c.groupes).toHaveLength(1)
    const g = c.groupes[0]
    expect(g.tiers).toBe('DUPONT SARL')       // résolu par la contrepartie 411DUP
    expect(g.conf).toBe(1)
    expect(g.freq).toBe('mensuel')
    expect(g.nN1).toBe(5)
    expect(g.nN).toBe(4)
    expect(g.verdict).toBe('manquant')
    expect(Math.round(g.ecart)).toBe(-500)
    // Décomposition : toute la variation du compte vient du manquant
    expect(Math.round(c.variation)).toBe(-500)
    expect(Math.round(c.manquants)).toBe(-500)
  })

  it('conforme : honoraires stables', () => {
    const g = findGroupe('charges', '6226').groupes[0]
    expect(g.verdict).toBe('conforme')
    expect(g.conf).toBe(2)                    // préfixe « CABINET AUDITEX/ »
  })

  it('montant anormal : loyer 1000 → 1300', () => {
    const c = findGroupe('charges', '613')
    const g = c.groupes[0]
    expect(g.verdict).toBe('montant_anormal')
    expect(Math.round(g.ecart)).toBe(1500)
    expect(Math.round(c.ecartsMontant)).toBe(1500)
  })

  it('nouveau : achat BRICOTRUC sans historique', () => {
    const c = findGroupe('charges', '607')
    expect(c.groupes[0].verdict).toBe('nouveau')
    expect(Math.round(c.nouveaux)).toBe(800)
  })

  it('OD : le compte 681 n\'a pas d\'attendus', () => {
    const c = findGroupe('charges', '681')
    expect(c.isOD).toBe(true)
    expect(c.groupes).toHaveLength(0)
    expect(Math.round(c.residuel)).toBe(200)
  })
})

describe('buildMethodeRapport — annexe A (questions au comptable)', () => {
  it('génère des questions pour manquants et anomalies significatifs, triées par impact', () => {
    const r = build()
    expect(r.questions.length).toBe(2)
    expect(r.questions[0].compte).toBe('613')          // |1500| > |500|
    expect(r.questions[0].verdict).toBe('montant_anormal')
    expect(r.questions[1].compte).toBe('706')
    expect(r.questions[1].verdict).toBe('manquant')
    expect(r.questions[1].question).toContain('facturation')
  })
})

describe('buildMethodeRapport — dégradation gracieuse', () => {
  it('sans N-1 : histoLimite, pas de verdicts, cadrage intact', () => {
    const raw = makeRAW()
    ;(raw.companies.TEST as any).p1 = {}
    const r = buildMethodeRapport(raw, { TEST: 1 }, 'TEST', { today: TODAY })!
    expect(r.histoLimite).toBe(true)
    const all = [...r.produits, ...r.charges].flatMap(f => f.comptes).flatMap(c => c.groupes)
    expect(all.every(g => g.verdict === null)).toBe(true)
    expect(r.questions).toHaveLength(0)
  })
})
