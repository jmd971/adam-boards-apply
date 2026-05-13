import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RAWData, CompanyRaw, FecAccount } from '@/types'

/* ─── Fixture RAW (1 société, 1 mois) ─────────────────────────────────────
 *  Ventes 707 :       100 000 €
 *  Achats 607 :        40 000 €  →  Marge = 60 000
 *  Salaires 641 :      15 000 €
 *  Loyer    613 :      10 000 €  →  Charges = 25 000
 *                                 →  Résultat = 35 000
 */
function buildAcct(mo: Record<string, [number, number]>): FecAccount {
  return { mo, l: '', e: [] }
}

const FIXTURE_RAW: RAWData = {
  keys: ['MC'],
  mn: ['2026-01'],
  m1: [],
  m2: [],
  companies: {
    MC: {
      name: 'MC',
      pn: {
        '707': buildAcct({ '2026-01': [0, 100_000] }),
        '607': buildAcct({ '2026-01': [40_000, 0] }),
        '641': buildAcct({ '2026-01': [15_000, 0] }),
        '613': buildAcct({ '2026-01': [10_000, 0] }),
      },
      p1: {}, p2: {}, bn: {}, b1: {}, b2: {},
      bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
    } satisfies CompanyRaw,
  },
}

/* ─── Mocks ──────────────────────────────────────────────────────────────── */

const storeState = {
  RAW: FIXTURE_RAW as RAWData | null,
  filters: { selCo: ['MC'], excludeOD: false, showMonths: false, showN1Full: false, startM: '', endM: '' },
  budData: {},
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

// Stub PlTable : le tableau détaillé est testé séparément.
vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>()
  return {
    ...actual,
    PlTable: () => <div data-testid="pl-table" />,
    EcrituresModal: () => null,
  }
})

// Recharts : jsdom n'a pas de layout → ResponsiveContainer ne mesure rien.
// On stub pour qu'au moins le bloc graphique soit présent dans le DOM.
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
  }
})

// Évite que le clic export PDF déclenche window.print() en test.
vi.mock('@/lib/export', () => ({
  exportPlCalcXlsx: vi.fn(),
  printModule: vi.fn(),
}))

import { Equilibre } from '@/modules/equilibre/Equilibre'

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('<Equilibre> — dashboard du haut (KPIs + chart + formule)', () => {
  beforeEach(() => {
    // Reset RAW au cas où un test précédent l'aurait set à null
    storeState.RAW = FIXTURE_RAW
  })

  it('rend les 5 KPI cards avec les bons labels', () => {
    render(<Equilibre />)
    expect(screen.getByText('Ventes')).toBeInTheDocument()
    expect(screen.getByText('Achats')).toBeInTheDocument()
    expect(screen.getByText('Marge brute')).toBeInTheDocument()
    expect(screen.getByText('Charges')).toBeInTheDocument()
    expect(screen.getByText('Résultat net')).toBeInTheDocument()
  })

  it('affiche les valeurs calculées correctes (et non 0 € fallback)', () => {
    render(<Equilibre />)
    // Si plCalc['tot_ventes'] devient introuvable suite à un refacto, on tomberait sur "0 €"
    // → ces assertions catch le bug.
    const allText = document.body.textContent ?? ''
    expect(allText).toMatch(/100\D000/)  // Ventes 100 000
    expect(allText).toMatch(/40\D000/)   // Achats
    expect(allText).toMatch(/60\D000/)   // Marge
    expect(allText).toMatch(/25\D000/)   // Charges
    expect(allText).toMatch(/35\D000/)   // Résultat
  })

  it('rend le graphique cascade (ResponsiveContainer présent)', () => {
    render(<Equilibre />)
    expect(screen.getByTestId('chart-container')).toBeInTheDocument()
  })

  it('rend la formule visuelle Ventes − Achats = Marge − Charges = Résultat', () => {
    render(<Equilibre />)
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/Ventes/)
    expect(body).toMatch(/Achats/)
    expect(body).toMatch(/Marge/)
    expect(body).toMatch(/Charges/)
    expect(body).toMatch(/Résultat/)
    // Vérifie que les opérateurs de la formule sont là
    expect(body).toContain('−')
    expect(body).toContain('=')
  })

  it('rend le PlTable détaillé sous le dashboard', () => {
    render(<Equilibre />)
    expect(screen.getByTestId('pl-table')).toBeInTheDocument()
  })

  it("affiche un fallback explicite quand RAW est null (n'efface pas l'UI)", () => {
    storeState.RAW = null
    render(<Equilibre />)
    expect(screen.getByText(/Aucune donnée/i)).toBeInTheDocument()
    // Ne doit PAS afficher les KPIs (early return)
    expect(screen.queryByText('Marge brute')).toBeNull()
  })
})
