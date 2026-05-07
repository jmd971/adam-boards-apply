import { useEffect, useState } from 'react'
import { sb } from '@/lib/supabase'

interface Tenant {
  id: string
  name: string
  slug: string
  created_at: string
  memberCount: number
}

interface Props {
  onSelectTenant: (id: string, name: string) => void
}

export function SuperadminDashboard({ onSelectTenant }: Props) {
  const [tenants, setTenants]   = useState<Tenant[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data: { session } } = await sb.auth.getSession()
        const jwt = session?.access_token
        if (!jwt) { setError('Session expirée'); return }
        const resp = await fetch('/api/list-tenants', {
          headers: { 'Authorization': `Bearer ${jwt}` }
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          setError(err.error ?? 'Erreur serveur')
          return
        }
        const data = await resp.json()
        setTenants(data)
      } catch (e: any) {
        setError(e?.message ?? 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#080d1a', color: '#f1f5f9',
      fontFamily: 'Outfit, Inter, sans-serif', padding: '40px 32px',
    }}>
      {/* Header */}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg,#3b82f6,#6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>🏢</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
              <span style={{ color: '#3b82f6' }}>adam</span>boards — Vue superadmin
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
              {tenants.length} client{tenants.length > 1 ? 's' : ''} actifs
            </div>
          </div>
        </div>

        {/* Search */}
        <input
          placeholder="Rechercher un client..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#f1f5f9', fontSize: 14, outline: 'none', marginBottom: 24,
            boxSizing: 'border-box',
          }}
        />

        {/* Content */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 64, color: '#475569' }}>
            Chargement des clients...
          </div>
        )}
        {error && (
          <div style={{
            padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13,
          }}>
            Erreur : {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 64, color: '#475569' }}>
            Aucun client trouvé
          </div>
        )}

        {/* Tenant list */}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 20px', borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'background 0.15s',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg,#1e3a5f,#1e40af)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: '#93c5fd',
                }}>
                  {t.name.slice(0, 1).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 2 }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569' }}>
                    {t.slug} · {t.memberCount} membre{t.memberCount > 1 ? 's' : ''} · créé le {new Date(t.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => onSelectTenant(t.id, t.name)}
                  style={{
                    padding: '8px 18px', borderRadius: 8, flexShrink: 0,
                    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                    color: '#93c5fd', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.15)' }}
                >
                  Accéder →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
