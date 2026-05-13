import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RAWData, CompanyRaw } from '@/types'

// Fixture : un bilan minimal avec actif + passif équilibré
const FIXTURE_RAW: RAWData = {
  keys: ['MC'],
  mn: ['2026-01'],
  m1: [],
  m2: [],
  companies: {
    MC: {
      name: 'MC',
      pn: {}, p1: {}, p2: {},
      bn: {
        '211': { s: 50_000, l: 'Immos', e: [], top: [] } as any,
        '512': { s: 30_000, l: 'Banque', e: [], top: [] } as any,
        '101': { s: -60_000, l: 'Capital', e: [], top: [] } as any,
        '401': { s: -20_000, l: 'Fournisseurs', e: [], top: [] } as any,
      },
      b1: {}, b2: {},
      bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [],
    } satisfies CompanyRaw,
  },
}

const storeState = {
  RAW: FIXTURE_RAW as RAWData | null,
  filters: { selCo: ['MC'], excludeOD: false, showMonths: false, showN1Full: false, startM: '', endM: '', showBudget: false, budCo: 'MC', budVersionKey: '' },
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))
vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>()
  return { ...actual, EcrituresModal: () => null }
})
vi.mock('@/lib/export', () => ({ exportBilanXlsx: vi.fn(), exportBilanCsv: vi.fn(), printModule: vi.fn() }))

import { Bilan } from '@/modules/bilan/Bilan'

describe('<Bilan> — smoke test', () => {
  beforeEach(() => { storeState.RAW = FIXTURE_RAW })

  it("rend les 4 KPIs (Total Actif / Capitaux propres / Dettes fin. / Trésorerie)", () => {
    render(<Bilan />)
    // Certains labels apparaissent aussi dans le tableau détaillé → getAllByText
    expect(screen.getAllByText('Total Actif').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Capitaux propres').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dettes financières').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Trésorerie').length).toBeGreaterThan(0)
  })

  it("affiche des valeurs non nulles avec un bilan rempli", () => {
    render(<Bilan />)
    const body = document.body.textContent ?? ''
    // Capitaux propres = |−60 000| = 60 000 (computeBilan applique Math.abs)
    expect(body).toMatch(/60\D000/)
    // Trésorerie = 30 000
    expect(body).toMatch(/30\D000/)
  })
})
