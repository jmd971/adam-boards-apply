import { useEffect, useState } from 'react'
import { sb } from '@/lib/supabase'
import { Spinner } from '@/components/ui'

interface Tenant { id: string; name: string }

interface Props {
  role: string
  onSelect: (tenantId: string, tenantName: string) => void
}

export function TenantSelector({ role, onSelect }: Props) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sb.from('tenants').select('id, name').order('name').then(({ data }) => {
      setTenants((data ?? []) as Tenant[])
      setLoading(false)
    })
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#080d1a', color: '#f1f5f9', padding: 32,
    }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
          Sélectionner un groupe
        </div>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          Connecté en tant que <span style={{ color: role === 'superadmin' ? '#a855f7' : '#f97316', fontWeight: 700 }}>
            {role === 'superadmin' ? 'Super Admin' : 'Admin Cabinet'}
          </span>
        </div>
      </div>

      {loading ? (
        <Spinner size={32} />
      ) : tenants.length === 0 ? (
        <div style={{ color: '#475569', fontSize: 13 }}>Aucun groupe trouvé</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, maxWidth: 900, width: '100%' }}>
          {tenants.map(t => (
            <button key={t.id} onClick={() => onSelect(t.id, t.name)} style={{
              padding: '20px 24px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#f1f5f9', textAlign: 'left', fontSize: 15, fontWeight: 600,
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.12)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.4)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🏢</div>
              <div>{t.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
