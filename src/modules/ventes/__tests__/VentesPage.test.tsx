import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock du store : RAW + manualEntries + filters + tenantId
const storeState = {
  RAW: null,
  manualEntries: [],
  filters: { selCo: ['MC'] },
  tenantId: 'tenant-1',
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

// Mock rfm + fecSales : on ne teste pas le calcul ici
vi.mock('@/lib/rfm', () => ({
  computeRFM: () => [],
  manualEntriesToTransactions: () => [],
  diagnoseEntries: () => ({ total: 0, ventes: 0, ventesCo: 0, ventesSansCp: 0, ventesSansDate: 0, eligibles: 0 }),
}))
vi.mock('@/lib/fecSales', () => ({
  fecToSaleTransactions: () => [],
  diagnoseFec: () => ({ companies: 0, clientsN: 0, clientsN1: 0, totalCA: 0, totalFactures: 0, transactions: 0 }),
}))

// Stub des sous-vues pour focaliser sur le routage choisi
vi.mock('@/modules/ventes/SegmentsView',  () => ({ SegmentsView:  () => <div data-testid="segments" /> }))
vi.mock('@/modules/ventes/CampagnesView', () => ({ CampagnesView: () => <div data-testid="campagnes" /> }))
vi.mock('@/modules/ventes/ArticlesView',  () => ({ ArticlesView:  () => <div data-testid="articles" /> }))
vi.mock('@/modules/ventes/ScenariosView', () => ({ ScenariosView: () => <div data-testid="scenarios" /> }))
vi.mock('@/modules/ventes/ImportWizard',  () => ({ ImportWizard:  () => <div data-testid="wizard" /> }))

import { Ventes } from '@/modules/ventes/VentesPage'

describe('<Ventes>', () => {
  beforeEach(() => {
    // Reset localStorage à chaque test : la regression était que ventes_source_*
    // restait persisté entre visites.
    localStorage.clear()
  })

  it("affiche toujours le chooser à l'entrée même si un choix POS était persisté", () => {
    // Reproduit l'ancien état où le bug se manifestait
    localStorage.setItem('ventes_source_tenant-1', 'pos')

    render(<Ventes />)

    // Le chooser doit s'afficher avec ses deux options
    expect(screen.getByText('Mes factures')).toBeInTheDocument()
    expect(screen.getByText('Fichier caisse / POS')).toBeInTheDocument()
  })

  it('après clic sur "Mes factures" sans factures, montre l\'état vide', () => {
    render(<Ventes />)
    fireEvent.click(screen.getByText('Mes factures'))

    // Aucune source → empty state diagnostique FEC + Saisie
    expect(screen.getByText(/Aucune facture exploitable/i)).toBeInTheDocument()
    expect(screen.getByText(/FEC \(extraction automatique\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Saisie manuelle \(fallback\)/i)).toBeInTheDocument()
  })

  it('après clic sur "Fichier caisse / POS", ouvre directement l\'import wizard', () => {
    render(<Ventes />)
    fireEvent.click(screen.getByText('Fichier caisse / POS'))

    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })
})
