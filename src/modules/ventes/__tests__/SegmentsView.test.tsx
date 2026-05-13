import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ClientRFM, RFMSegment } from '@/lib/rfm'

// Stub KpiCard avant import : on isole le test du composant ui
vi.mock('@/components/ui', () => ({
  KpiCard: ({ label, value }: { label: string; value: string }) =>
    <div data-testid={`kpi-${label}`}>{label}: {value}</div>,
}))

import { SegmentsView } from '@/modules/ventes/SegmentsView'

function client(over: Partial<ClientRFM>): ClientRFM {
  return {
    key: 'k', nom: 'Client', ca: 1000, nbVisites: 1,
    lastDate: '2026-05-01', daysSinceLast: 12,
    scoreR: 4, scoreF: 1, scoreM: 3,
    segment: 'one_shot' as RFMSegment,
    transactions: [],
    ...over,
  }
}

const FIXTURE: ClientRFM[] = [
  client({ key: 'c1', nom: 'Alice',  ca: 10_000, segment: 'champion' }),
  client({ key: 'c2', nom: 'Bob',    ca: 8_000,  segment: 'champion' }),
  client({ key: 'c3', nom: 'Carla',  ca: 5_000,  segment: 'fidele'   }),
  client({ key: 'c4', nom: 'David',  ca: 2_000,  segment: 'one_shot' }),
  client({ key: 'c5', nom: 'Emma',   ca: 1_000,  segment: 'one_shot' }),
  client({ key: 'c6', nom: 'Felix',  ca: 500,    segment: 'perdu'    }),
]

describe('<SegmentsView>', () => {
  it('rend les 4 KPIs (Clients / CA / Champions / One-shot) avec les bonnes valeurs', () => {
    render(<SegmentsView clients={FIXTURE} />)
    expect(screen.getByTestId('kpi-Clients analysés').textContent).toContain('6')
    expect(screen.getByTestId('kpi-Champions').textContent).toContain('2')
    expect(screen.getByTestId('kpi-One-shot').textContent).toContain('2')
    // CA total = 26 500
    expect(screen.getByTestId('kpi-CA total').textContent).toMatch(/26\D500/)
  })

  it('affiche tous les segments avec leur compte dans les filtres', () => {
    render(<SegmentsView clients={FIXTURE} />)
    // Filter bar contient Tous + 6 segments. Le bouton "Tous" doit afficher 6.
    expect(screen.getByRole('button', { name: /Tous.*6/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Champion.*2/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fidèle.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /One.shot.*2/i })).toBeInTheDocument()
  })

  it('filtre les clients quand on clique sur un segment', () => {
    render(<SegmentsView clients={FIXTURE} />)
    // Initialement tous les clients affichés
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Felix')).toBeInTheDocument()

    // Filtrer sur "Champion"
    fireEvent.click(screen.getByRole('button', { name: /Champion.*2/i }))

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Felix')).toBeNull()
    expect(screen.queryByText('Carla')).toBeNull()
  })

  it('rend les 0 quand aucun client (état vide)', () => {
    render(<SegmentsView clients={[]} />)
    expect(screen.getByTestId('kpi-Clients analysés').textContent).toContain('0')
    expect(screen.getByTestId('kpi-Champions').textContent).toContain('0')
    expect(screen.getByTestId('kpi-One-shot').textContent).toContain('0')
  })
})
