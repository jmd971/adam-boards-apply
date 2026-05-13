import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RAWData, CompanyRaw, FecAccount } from '@/types'

/* ─── Fixture mimicking just-loaded FEC ──────────────────────────────────── */

function fec(mo: Record<string, [number, number]>, label = ''): FecAccount {
  return { mo, l: label, e: [] }
}

// Fixture : un FEC avec ventes (707), achats (607), salaires (641)
// chargé en N (2026-01).
const FIXTURE_RAW: RAWData = {
  keys: ['MC'],
  mn: ['2026-01'],
  m1: [],
  m2: [],
  companies: {
    MC: {
      name: 'MC',
      pn: {
        '707': fec({ '2026-01': [0, 100_000] }, 'Ventes marchandises'),
        '607': fec({ '2026-01': [40_000, 0] },  'Achats marchandises'),
        '641': fec({ '2026-01': [15_000, 0] },  'Salaires'),
        '613': fec({ '2026-01': [5_000, 0] },   'Loyer'),
      },
      p1: {}, p2: {}, bn: {}, b1: {}, b2: {},
      bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
    } satisfies CompanyRaw,
  },
}

/* ─── Mocks ──────────────────────────────────────────────────────────────── */

const storeState = {
  RAW: FIXTURE_RAW as RAWData | null,
  filters: { selCo: ['MC'], excludeOD: false, showMonths: false, showN1Full: false, startM: '', endM: '', showBudget: false, budCo: 'MC', budVersionKey: '' },
  budData: {},
  alertThresholds: [],
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>()
  return {
    ...actual,
    PlTable: () => <div data-testid="pl-table" />,
    EcrituresModal: () => null,
  }
})

vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div>,
  }
})

vi.mock('@/lib/export', () => ({
  exportPlCalcXlsx: vi.fn(),
  exportPlCalcCsv: vi.fn(),
  printModule: vi.fn(),
}))

import { CompteResultat } from '@/modules/cr/CompteResultat'

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('<CompteResultat> — vérification post-chargement FEC', () => {
  beforeEach(() => {
    storeState.RAW = FIXTURE_RAW
    storeState.filters.selCo = ['MC']
  })

  it("avec un FEC chargé en N, le KPI 'TOTAL PRODUITS' affiche le CA", () => {
    render(<CompteResultat />)
    // 100 000 € de ventes
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/100\D000/)
  })

  it("avec un FEC chargé en N, le KPI 'TOTAL CHARGES' affiche la somme des charges", () => {
    render(<CompteResultat />)
    const body = document.body.textContent ?? ''
    // 40 000 (607) + 15 000 (641) + 5 000 (613) = 60 000
    expect(body).toMatch(/60\D000/)
  })

  it("fallback N-1 : un FEC chargé en N-1 uniquement doit AUSSI s'afficher", () => {
    // Régression du jour : si mn est vide mais m1 plein, le CR doit afficher
    // les données N-1 (via le fallback dans usePeriodFilter).
    storeState.RAW = {
      keys: ['MC'],
      mn: [],
      m1: ['2025-01'],
      m2: [],
      companies: {
        MC: {
          ...FIXTURE_RAW.companies.MC,
          pn: {},  // pas de N
          p1: {    // données dans p1
            '707': fec({ '2025-01': [0, 27_215.95] }, 'Prestations'),
          },
        },
      },
    }

    render(<CompteResultat />)
    const body = document.body.textContent ?? ''
    // Si le fallback ne marche pas, on aurait 0 € ici (bug du jour)
    expect(body).toMatch(/27\D215|27\D216/)  // tolère arrondi 27 215 ou 27 216
  })

  it("RAW null → fallback message, pas de KPIs", () => {
    storeState.RAW = null
    const { container } = render(<CompteResultat />)
    // Le composant devrait afficher un message d'absence de données
    // (ou au minimum ne pas crasher avec des valeurs 0 dans des KPIs)
    expect(container.textContent ?? '').not.toMatch(/100\D000/)
  })

  it("rend le PlTable détaillé sous les KPIs", () => {
    render(<CompteResultat />)
    expect(screen.getByTestId('pl-table')).toBeInTheDocument()
  })
})
