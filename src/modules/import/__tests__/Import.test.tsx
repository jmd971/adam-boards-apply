import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/* ─── Mocks ──────────────────────────────────────────────────────────────── */

const storeState = {
  role: 'admin',
  tenantId: 't1',
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

// parseFEC : on retourne un parsed valide sans s'embêter avec un vrai contenu FEC
vi.mock('@/lib/fec', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fec')>('@/lib/fec')
  return {
    ...actual,
    parseFEC: vi.fn(() => ({
      plData:    { '707': { mo: { '2026-01': [0, 1000] as [number, number] }, l: 'Ventes', e: [] } },
      bilanData: {},
      months:    ['2026-01'],
      entryCount: 1,
      clientData: {},
      veEntries: [],
      warnings:  [],
      skippedLines: 0,
    })),
    detectCompany:     () => 'MC',
    detectCompanyName: () => 'MC',
    detectPeriod:      () => ({ period: 'N' as const, fy: '2026' }),
  }
})

// Supabase : maybeSingle pour la détection de conflit, upsert pour l'écriture
const upsertMock = vi.fn(() => Promise.resolve({ error: null }))
const maybeSingleMock = vi.fn(() => Promise.resolve({ data: null }))
vi.mock('@/lib/supabase', () => ({
  sb: {
    from: () => ({
      select:      () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }) }),
      upsert:      upsertMock,
    }),
  },
}))

import { Import } from '@/modules/import/Import'

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('<Import> — contrat post-upsert', () => {
  beforeEach(() => {
    upsertMock.mockClear()
    maybeSingleMock.mockClear()
  })

  it('invalide le cache companyData après upsert FEC réussi (régression du jour)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={qc}>
        <Import />
      </QueryClientProvider>
    )

    // Upload d'un fichier dans le 1er drop zone (N-2). parseFEC est mocké donc le
    // contenu n'a pas d'importance.
    const file = new File(['fake-fec-content'], 'sample.txt', { type: 'text/plain' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    expect(fileInputs.length).toBeGreaterThan(0)
    await user.upload(fileInputs[0] as HTMLInputElement, file)

    // Le bouton "Importer (1)" doit apparaître après le parse
    await waitFor(() => expect(screen.getByText(/Importer/)).toBeInTheDocument())

    fireEvent.click(screen.getByText(/Importer/))

    // upsert est appelé puis invalidateQueries
    await waitFor(() => expect(upsertMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['companyData'] })
    )
  })

  it("n'invalide PAS le cache si tous les imports ont échoué", async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: 'fail' } as any })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={qc}>
        <Import />
      </QueryClientProvider>
    )

    const file = new File(['fake'], 'fail.txt', { type: 'text/plain' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    await user.upload(fileInputs[0] as HTMLInputElement, file)
    await waitFor(() => expect(screen.getByText(/Importer/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Importer/))
    await waitFor(() => expect(upsertMock).toHaveBeenCalled())

    // Avec une erreur upsert, invalidateQueries ne doit PAS être appelé
    // (gardian: if newResults.some(r => !r.error))
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['companyData'] })
  })
})
