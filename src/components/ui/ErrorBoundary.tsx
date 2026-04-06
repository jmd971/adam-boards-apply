import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  moduleName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { moduleName } = this.props
    const { error } = this.state

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: 320, gap: 16, textAlign: 'center', padding: '0 32px',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
        }}>
          !
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
          Erreur{moduleName ? ` — ${moduleName}` : ''}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', maxWidth: 400 }}>
          Une erreur inattendue s'est produite dans ce module. Les autres onglets restent accessibles.
        </div>
        {error && (
          <div style={{
            fontSize: 10, fontFamily: 'monospace', color: '#ef4444',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 8, padding: '8px 14px', maxWidth: 500, wordBreak: 'break-word',
          }}>
            {error.message}
          </div>
        )}
        <button
          onClick={this.handleRetry}
          style={{
            padding: '9px 24px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none',
            color: '#fff', cursor: 'pointer', marginTop: 4,
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }
}
