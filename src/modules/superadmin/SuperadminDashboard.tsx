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
  const [tenants, setTenants]         = useState<Tenant[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [confirmId, setConfirmId]     = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
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

  useEffect(() => { load() }, [])

  const handleDelete = async (tenantId: string) => {
    setDeleting(tenantId)
    try {
      const { data: { session } } = await sb.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) { setError('Session expirée'); return }
      const resp = await fetch(`/api/delete-tenant?id=${tenantId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${jwt}` },
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setError(err.error ?? 'Erreur lors de la suppression')
        return
      }
      setTenants(ts => ts.filter(t => t.id !== tenantId))
    } catch (e: any) {
      setError(e?.message ?? 'Erreur inconnue')
    } finally {
      setDeleting(null)
      setConfirmId(null)
    }
  }

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="ab-light" style={{
      minHeight: '100vh', background: 'var(--bg-0)', color: 'var(--text-0)',
      fontFamily: 'Outfit, Inter, sans-serif', padding: '40px 32px',
    }}>
      {/* Confirmation modal */}
      {confirmId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 14, padding: '28px 32px', maxWidth: 400, width: '90%',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: 'var(--text-0)' }}>
              Supprimer ce client ?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>
              Toutes les données associées (FEC, saisies, budget) seront définitivement supprimées.
              Cette action est irréversible.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmId(null)}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  background: 'var(--bg-2)', border: '1px solid var(--border-1)',
                  color: 'var(--text-2)', fontSize: 13, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(confirmId)}
                disabled={!!deleting}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  color: '#f87171', fontSize: 13, fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg,#1e88c7,#6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>🏢</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-0)' }}>
              <span style={{ color: '#1e88c7' }}>adam</span>boards — Vue superadmin
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
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
            background: 'var(--bg-2)', border: '1px solid var(--border-1)',
            color: 'var(--text-0)', fontSize: 14, outline: 'none', marginBottom: 24,
            boxSizing: 'border-box',
          }}
        />

        {/* Error */}
        {error && (
          <div style={{
            padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13,
            marginBottom: 16,
          }}>
            Erreur : {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-2)' }}>
            Chargement des clients...
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-2)' }}>
            Aucun client trouvé
          </div>
        )}

        {/* Tenant list */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 20px', borderRadius: 12,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-1)',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg,#1e3a5f,#1e40af)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: '#1e88c7',
                }}>
                  {t.name.slice(0, 1).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)', marginBottom: 2 }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {t.slug} · {t.memberCount} membre{t.memberCount !== 1 ? 's' : ''} · créé le {new Date(t.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setConfirmId(t.id)}
                    disabled={!!deleting}
                    style={{
                      padding: '8px 14px', borderRadius: 8,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      color: '#f87171', fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer',
                      opacity: deleting ? 0.5 : 1,
                    }}
                    title="Supprimer ce client"
                  >
                    🗑
                  </button>
                  <button
                    onClick={() => onSelectTenant(t.id, t.name)}
                    style={{
                      padding: '8px 18px', borderRadius: 8,
                      background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                      color: '#1e88c7', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.15)' }}
                  >
                    Accéder →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
