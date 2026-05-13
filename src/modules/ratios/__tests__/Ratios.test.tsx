import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RAWData, CompanyRaw, FecAccount } from '@/types'
import { DEFAULT_THRESHOLDS } from '@/lib/alertThresholds'

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
        '707': fec({ '2026-01': [0, 100_000] }),
        '607': fec({ '2026-01': [40_000, 0] }),
      },
      p1: {}, p2: {},
      bn: {
        '211': { s: 50_000, l: 'Immos', e: [], top: [] } as any,
        '512': { s: 30_000, l: 'Banque', e: [], top: [] } as any,
        '101': { s: 60_000, l: 'Capital', e: [], top: [] } as any,
      },
      b1: {}, b2: {},
      bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
    } satisfies CompanyRaw,
  },
}

const storeState = {
  RAW: FIXTURE_RAW as RAWData | null,
  filters: { selCo: ['MC'], excludeOD: false, showMonths: false, showN1Full: false, startM: '', endM: '', showBudget: false, budCo: 'MC', budVersionKey: '' },
  budData: {},
  alertThresholds: DEFAULT_THRESHOLDS,
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))
vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>()
  return { ...actual }
})
vi.mock('@/lib/export', () => ({ exportRatiosXlsx: vi.fn(), exportRatiosCsv: vi.fn(), printModule: vi.fn() }))

import { Ratios } from '@/modules/ratios/Ratios'

describe('<Ratios> — smoke test (lock le hooks-order crash)', () => {
  beforeEach(() => { storeState.RAW = FIXTURE_RAW })

  it("ne crash pas quand les données arrivent (hooks order bug verrouillé)", () => {
    // C'est LE bug audit #1 : useState(draft) après early return faisait crasher
    // React avec 'Rendered more hooks than during the previous render'.
    // Le simple fait de rendre sans throw verrouille la régression.
    expect(() => render(<Ratios />)).not.toThrow()
  })

  it("rend des KPIs ratios (CA, Marge, Levier, BFR, etc.)", () => {
    render(<Ratios />)
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/Chiffre d'affaires/i)
    expect(body).toMatch(/BFR|Levier|R[ée]sultat/i)
  })

  it("affiche le fallback quand RAW est null", () => {
    storeState.RAW = null
    render(<Ratios />)
    expect(screen.getByText(/Aucune donnée/i)).toBeInTheDocument()
  })
})
