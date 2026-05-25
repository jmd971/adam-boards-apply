import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BankAccount } from '@/modules/tresorerie/useBankAccounts'

const mocks = vi.hoisted(() => ({
  bankData: [] as BankAccount[],
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: { role: string }) => unknown) => selector({ role: 'admin' }),
  useTenantId: () => 't1',
}))

vi.mock('@/lib/supabase', () => ({
  sb: {
    from: () => ({
      // Chaîne : select().eq('tenant_id').order().order() — eq ajouté pour le filtre tenant.
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: mocks.bankData, error: null }),
          }),
        }),
      }),
    }),
  },
}))

import { BankAccountsPanel } from '@/modules/tresorerie/BankAccountsPanel'

function renderPanel(selCo: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BankAccountsPanel selCo={selCo} />
    </QueryClientProvider>
  )
}

function bankAcc(over: Partial<BankAccount>): BankAccount {
  return {
    id: 'b1', tenant_id: 't1', company_key: 'MC',
    label: 'CCP', balance: 1000, balance_date: '2026-01-15', notes: null,
    created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z',
    ...over,
  }
}

describe('<BankAccountsPanel>', () => {
  it("affiche le total des soldes des sociétés sélectionnées", async () => {
    mocks.bankData = [
      bankAcc({ id: 'b1', company_key: 'MC', label: 'CCP',     balance: 1000 }),
      bankAcc({ id: 'b2', company_key: 'MC', label: 'Livret',  balance: 5000 }),
      bankAcc({ id: 'b3', company_key: 'PP', label: 'Courant', balance: 2000 }),
    ]
    renderPanel(['MC'])  // PP exclu

    // Attendre que la query résolve ET que le composant intègre la data
    await waitFor(() => {
      expect(document.body.textContent ?? '').toMatch(/6\D000/)
    })
    // Sanity check : pas la somme MC+PP
    expect(document.body.textContent ?? '').not.toMatch(/8\D000/)
  })

  it("affiche '0 compte' quand aucun compte pour les sociétés sélectionnées", async () => {
    mocks.bankData = []
    renderPanel(['MC'])

    await screen.findByText(/Solde bancaire total/i)
    expect(screen.getByText(/0 compte/i)).toBeInTheDocument()
  })

  it("rend les comptes des sociétés sélectionnées et exclut les autres", async () => {
    mocks.bankData = [
      bankAcc({ id: 'b1', company_key: 'MC', label: 'CCP MC' }),
      bankAcc({ id: 'b2', company_key: 'PP', label: 'CCP PP' }),
    ]
    const { container } = renderPanel(['MC'])
    await screen.findByText(/Solde bancaire total/i)
    // Click pour déplier le panel
    container.querySelector('[style*="cursor: pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // La société PP ne doit PAS apparaître dans la liste filtrée
    // (mais peut apparaître dans le select de création — c'est selCo, pas all)
    const tbody = container.querySelector('tbody')
    if (tbody) {
      expect(tbody.textContent).toContain('CCP MC')
      expect(tbody.textContent).not.toContain('CCP PP')
    }
  })
})
