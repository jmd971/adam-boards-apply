import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RAWData, CompanyRaw, FecAccount } from '@/types'

function fec(mo: Record<string, [number, number]>, label = ''): FecAccount {
  return { mo, l: label, e: [] }
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
        '707': fec({ '2026-01': [0, 100_000] }, 'Ventes'),
        '607': fec({ '2026-01': [40_000, 0] }, 'Achats'),
        '641': fec({ '2026-01': [15_000, 0] }, 'Salaires'),
      },
      p1: {}, p2: {}, bn: {}, b1: {}, b2: {},
      bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
    } satisfies CompanyRaw,
  },
}

const storeState = {
  RAW: FIXTURE_RAW as RAWData | null,
  filters: { selCo: ['MC'], excludeOD: false, showMonths: false, showN1Full: false, startM: '', endM: '', showBudget: false, budCo: 'MC', budVersionKey: '' },
  budData: {},
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))
vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>()
  return { ...actual, PlTable: () => <div data-testid="pl-table" />, EcrituresModal: () => null }
})
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>()
  return { ...actual, ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div> }
})
vi.mock('@/lib/export', () => ({ exportPlCalcXlsx: vi.fn(), exportPlCalcCsv: vi.fn(), printModule: vi.fn() }))

import { Sig } from '@/modules/sig/Sig'

describe('<Sig> — smoke test post-chargement FEC', () => {
  beforeEach(() => { storeState.RAW = FIXTURE_RAW })

  it("rend les 5 KPIs (CA, VA, EBE, Résultat Net, Taux VA / CA)", () => {
    render(<Sig />)
    expect(screen.getByText("Chiffre d'affaires")).toBeInTheDocument()
    expect(screen.getByText('Valeur Ajoutée')).toBeInTheDocument()
    expect(screen.getByText('EBE')).toBeInTheDocument()
    expect(screen.getByText('Résultat Net')).toBeInTheDocument()
    expect(screen.getByText('Taux VA / CA')).toBeInTheDocument()
  })

  it("affiche le CA calculé (pas 0)", () => {
    render(<Sig />)
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/100\D000/)
  })

  it("rend PlTable et le chart", () => {
    render(<Sig />)
    expect(screen.getByTestId('pl-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0)
  })
})
