import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { RAWData } from '@/types'

const storeState = {
  RAW: null as RAWData | null,
  filters: { selCo: [], excludeOD: false, showMonths: true, showN1Full: false, startM: '', endM: '' },
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

import { usePeriodFilter } from '@/hooks/usePeriodFilter'

function makeRAW(mn: string[], m1: string[]): RAWData {
  return { companies: {}, mn, m1, m2: [], keys: ['MC'] }
}

describe('usePeriodFilter', () => {
  it("default selectedMs = RAW.mn quand N est importé", () => {
    storeState.RAW = makeRAW(['2026-01', '2026-02', '2026-03'], [])
    storeState.filters.startM = ''
    storeState.filters.endM = ''
    const { result } = renderHook(() => usePeriodFilter())
    expect(result.current.selectedMs).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(result.current.msSrc).toEqual(['pn', 'pn', 'pn'])
  })

  it('fallback N-1 quand RAW.mn est vide mais m1 contient des mois', () => {
    // Cas réel : utilisateur a uploadé un FEC 2025 en 2026, auto-classé N-1.
    // Régression: avant le fix, selectedMs = [] → cumulN = 0 partout sur CR/SIG/Bilan.
    storeState.RAW = makeRAW([], ['2025-01', '2025-02', '2025-03'])
    storeState.filters.startM = ''
    storeState.filters.endM = ''
    const { result } = renderHook(() => usePeriodFilter())
    expect(result.current.selectedMs).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(result.current.msSrc).toEqual(['p1', 'p1', 'p1'])
  })

  it('selectedMs = [] quand ni N ni N-1 ne sont importés', () => {
    storeState.RAW = makeRAW([], [])
    storeState.filters.startM = ''
    storeState.filters.endM = ''
    const { result } = renderHook(() => usePeriodFilter())
    expect(result.current.selectedMs).toEqual([])
  })

  it('priorité N sur N-1 quand les deux sont importés', () => {
    storeState.RAW = makeRAW(['2026-01'], ['2025-01'])
    storeState.filters.startM = ''
    storeState.filters.endM = ''
    const { result } = renderHook(() => usePeriodFilter())
    expect(result.current.selectedMs).toEqual(['2026-01'])
    expect(result.current.msSrc).toEqual(['pn'])
  })

  it('msSrc tague chaque mois selon sa présence dans mn ou m1', () => {
    storeState.RAW = makeRAW(['2026-01', '2026-02'], ['2025-01', '2025-02'])
    storeState.filters.startM = '2025-01'
    storeState.filters.endM = '2026-02'
    const { result } = renderHook(() => usePeriodFilter())
    expect(result.current.selectedMs).toEqual(['2025-01', '2025-02', '2026-01', '2026-02'])
    expect(result.current.msSrc).toEqual(['p1', 'p1', 'pn', 'pn'])
  })
})
