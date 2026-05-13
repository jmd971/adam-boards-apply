import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KpiCard } from '@/components/ui/KpiCard'

describe('<KpiCard>', () => {
  it('renders label and value', () => {
    render(<KpiCard label="Chiffre d'affaires" value="1 234 €" />)
    expect(screen.getByText("Chiffre d'affaires")).toBeInTheDocument()
    expect(screen.getByText('1 234 €')).toBeInTheDocument()
  })

  it('renders optional subtitle', () => {
    render(<KpiCard label="CA" value="100" sub="N-1 : 90 €" />)
    expect(screen.getByText('N-1 : 90 €')).toBeInTheDocument()
  })

  it('omits subtitle when not provided', () => {
    const { container } = render(<KpiCard label="CA" value="100" />)
    // Pas de div pour le sub : le composant a 4 nœuds (accent bar + label/trend + valeur)
    expect(container.textContent).not.toContain('N-1')
  })

  it('shows trend badge with up arrow when positive', () => {
    render(<KpiCard label="CA" value="100" trend={15.3} />)
    expect(screen.getByText(/\+15\.3%/)).toBeInTheDocument()
  })

  it('shows trend badge with down arrow when negative', () => {
    render(<KpiCard label="CA" value="100" trend={-8.5} />)
    expect(screen.getByText(/8\.5%/)).toBeInTheDocument()
  })

  it('shows stagnation marker when trend abs < 2%', () => {
    render(<KpiCard label="CA" value="100" trend={1.2} />)
    expect(screen.getByText(/~1\.2%/)).toBeInTheDocument()
  })

  it('hides info button when onInfo is not provided', () => {
    render(<KpiCard label="CA" value="100" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows info button and triggers callback when onInfo is provided', () => {
    const onInfo = vi.fn()
    render(<KpiCard label="CA" value="100" onInfo={onInfo} />)
    const btn = screen.getByTitle(/explication/i)
    fireEvent.click(btn)
    expect(onInfo).toHaveBeenCalledOnce()
  })
})
