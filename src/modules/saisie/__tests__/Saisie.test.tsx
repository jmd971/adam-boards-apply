import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RAWData, CompanyRaw } from '@/types'

/* ─── Mocks ──────────────────────────────────────────────────────────────── */

const FIXTURE_RAW: RAWData = {
  keys: ['MC'],
  mn: ['2026-01'],
  m1: [],
  m2: [],
  companies: {
    MC: { name: 'MC', pn: {}, p1: {}, p2: {}, bn: {}, b1: {}, b2: {}, bud: {}, cdN: {}, cdN1: {}, veN: [], veN1: [] } satisfies CompanyRaw,
  },
}

const storeState = {
  RAW: FIXTURE_RAW as RAWData | null,
  filters: { selCo: ['MC'], excludeOD: false, showMonths: false, showN1Full: false, startM: '', endM: '', showBudget: false, budCo: 'MC', budVersionKey: '' },
  role: 'admin',
  tenantId: 't1',
  manualEntries: [],
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
  useTenantId: () => storeState.tenantId,
}))

// vi.mock est hoisté avant les declarations → wrapper les mocks dans vi.hoisted
const mocks = vi.hoisted(() => ({
  select:  vi.fn(() => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) })),
  insert:  vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) })),
  session: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'jwt-fake' } } })),
  upload:  vi.fn(() => Promise.resolve({ error: null })),
}))

vi.mock('@/lib/supabase', () => ({
  sb: {
    from: () => ({ select: mocks.select, insert: mocks.insert }),
    auth: { getSession: mocks.session },
    storage: { from: () => ({ upload: mocks.upload, createSignedUrl: vi.fn() }) },
  },
  OCR_PROXY_URL: 'http://test/ocr-proxy',
}))

vi.mock('@/components/ui', async (orig) => {
  const actual = await orig<typeof import('@/components/ui')>()
  return { ...actual }
})

import { Saisie } from '@/modules/saisie/Saisie'

/* ─── Tests ──────────────────────────────────────────────────────────────── */

describe('<Saisie> — smoke + contrat OCR', () => {
  beforeEach(() => {
    mocks.select.mockClear()
    mocks.insert.mockClear()
    mocks.session.mockClear()
    storeState.RAW = FIXTURE_RAW
  })

  it("rend le module avec le formulaire et le tabbar (manuel/OCR)", async () => {
    render(<Saisie />)
    // Tabs OCR/manuel
    await waitFor(() => {
      expect(screen.getByText(/Saisie manuelle/i)).toBeInTheDocument()
      expect(screen.getByText(/Scanner.*OCR/i)).toBeInTheDocument()
    })
  })

  it("affiche un fallback quand RAW est null (pas de crash)", () => {
    storeState.RAW = null
    expect(() => render(<Saisie />)).not.toThrow()
  })

  it("OCR appelle l'API avec model='claude-opus-4-7' (régression du modèle Claude invalide)", async () => {
    // Mock global fetch pour intercepter l'appel OCR_PROXY_URL
    const fetchSpy = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"date":"2026-01-15","amount_ttc":120,"amount_ht":100,"category":"Depense","subcategory":"Autre","label":"Test","counterpart":"Fournisseur"}' }] }),
    } as any))
    vi.stubGlobal('fetch', fetchSpy)

    const user = userEvent.setup()
    render(<Saisie />)

    // Bascule sur le mode OCR
    await user.click(screen.getByText(/Scanner.*OCR/i))

    // Sélectionne un fichier
    const file = new File(['fake-image'], 'facture.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"][accept*="image"]')
    expect(fileInput).toBeTruthy()
    await user.upload(fileInput as HTMLInputElement, file)

    // Vérifie que fetch a été appelé avec le bon modèle
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled(), { timeout: 3000 })

    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://test/ocr-proxy')
    const body = JSON.parse(opts.body as string)
    // Le bug du jour : model était 'claude-opus-4-5' (invalide) → on lock à 4-7
    expect(body.model).toBe('claude-opus-4-7')
    expect(body.model).not.toBe('claude-opus-4-5')

    vi.unstubAllGlobals()
  })
})
