import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({
  switchTenant: vi.fn(),
  setTab: vi.fn(),
  setFilters: vi.fn(),
  countSelect: vi.fn(() => ({ eq: () => Promise.resolve({ count: 0 }) })),
}))

const storeState = {
  tab: 'dashboard',
  user: { id: 'u1', email: 'admin@test.fr' },
  role: 'superadmin' as string,
  tenantId: null as string | null,
  tenantName: null as string | null,
  RAW: null as any,
  filters: { selCo: [] as string[] },
  setTab: mocks.setTab,
  setFilters: mocks.setFilters,
  switchTenant: mocks.switchTenant,
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))
vi.mock('@/lib/supabase', () => ({
  sb: {
    from: () => ({ select: mocks.countSelect }),
  },
}))

import { Sidebar } from '@/components/layout/Sidebar'

function renderSidebar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Sidebar />
    </QueryClientProvider>
  )
}

describe('<Sidebar>', () => {
  beforeEach(() => {
    mocks.switchTenant.mockClear()
    storeState.role = 'admin'
    storeState.tenantId = 't1'
    storeState.tenantName = 'Cabinet'
  })

  it("affiche le bouton '← Tous les clients' pour un superadmin DANS un tenant (régression du jour)", () => {
    storeState.role = 'superadmin'
    storeState.tenantId = 't-cocon'
    storeState.tenantName = 'Cocon de bea'

    renderSidebar()
    expect(screen.getByText(/Tous les clients/i)).toBeInTheDocument()
  })

  it("le clic sur '← Tous les clients' appelle switchTenant(null, null, 'superadmin')", () => {
    storeState.role = 'superadmin'
    storeState.tenantId = 't-cocon'

    renderSidebar()
    fireEvent.click(screen.getByText(/Tous les clients/i))
    expect(mocks.switchTenant).toHaveBeenCalledWith(null, null, 'superadmin')
  })

  it("ne montre PAS le bouton pour un admin classique (non-superadmin)", () => {
    storeState.role = 'admin'
    storeState.tenantId = 't1'

    renderSidebar()
    expect(screen.queryByText(/Tous les clients/i)).toBeNull()
  })

  it("ne montre PAS le bouton si le superadmin n'a pas encore choisi de tenant", () => {
    storeState.role = 'superadmin'
    storeState.tenantId = null

    renderSidebar()
    expect(screen.queryByText(/Tous les clients/i)).toBeNull()
  })

  it("ne rend pas de '0' vagabond quand RAW.mn est vide (autre régression connue)", () => {
    storeState.role = 'admin'
    storeState.tenantId = 't1'
    storeState.RAW = { mn: [], m1: [], m2: [], keys: [], companies: {} }

    renderSidebar()
    // Le footer ne doit pas contenir un "0" littéral isolé
    // (bug: '{RAW?.mn?.length && (...)}' rendait '0' quand mn était [])
    const userSection = document.querySelector('aside')
    // Si présent, "0" comme bloc unique invisible n'apparaît pas dans le markup
    const text = userSection?.textContent ?? ''
    // Pas de "0" non précédé/suivi d'un autre caractère significatif au footer
    expect(text).not.toMatch(/\b0\b(?!\s*(client|jour|écriture))/i)
  })
})
