import { useEffect, useState } from 'react'
import { sb } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { roleLabel, roleColor } from '@/lib/roles'
import { useAppStore } from '@/store'

interface TeamMember {
  id: string
  user_id: string
  role: string
  email?: string
}

const ROLES = ['admin', 'comptable', 'viewer'] as const

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '20px 24px',
}

const inp: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
  color: '#f1f5f9', fontSize: 13, outline: 'none',
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}

function Msg({ msg }: { msg: { type: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null
  return (
    <div style={{
      marginTop: 10, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
      background: msg.type === 'ok' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
      color: msg.type === 'ok' ? '#34d399' : '#f87171',
    }}>
      {msg.text}
    </div>
  )
}

export function Souscription() {
  const tenantId   = useAppStore(s => s.tenantId)
  const tenantName = useAppStore(s => s.tenantName)
  const currentRole = useAppStore(s => s.role)

  const [members, setMembers]   = useState<TeamMember[]>([])
  const [loading, setLoading]   = useState(true)

  // Formulaire invitation
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'admin' | 'comptable' | 'viewer'>('viewer')
  const [inviting,    setInviting]    = useState(false)
  const [inviteMsg,   setInviteMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Changement de rôle
  const [changingRole, setChangingRole] = useState<string | null>(null)

  const isAdmin = currentRole === 'admin'

  const refresh = async () => {
    if (!tenantId) return
    const { data } = await sb
      .from('user_roles')
      .select('id, user_id, role')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })

    // Récupérer les emails via auth (best-effort — RLS peut limiter)
    setMembers((data ?? []) as TeamMember[])
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [tenantId])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || !tenantId) return
    setInviting(true); setInviteMsg(null)

    try {
      const resp = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     inviteEmail.trim(),
          tenant_id: tenantId,
          role:      inviteRole,
        }),
      })
      const json = await resp.json() as any
      if (!resp.ok) throw new Error(json.error ?? 'Erreur invitation.')
      setInviteMsg({ type: 'ok', text: `${inviteEmail} a bien été invité(e) en tant que ${roleLabel(inviteRole)}.` })
      setInviteEmail('')
      await refresh()
    } catch (err: any) {
      setInviteMsg({ type: 'err', text: err.message })
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    setChangingRole(memberId)
    const { error } = await sb
      .from('user_roles')
      .update({ role: newRole })
      .eq('id', memberId)
    setChangingRole(null)
    if (error) alert('Erreur : ' + error.message)
    else await refresh()
  }

  async function handleRemove(memberId: string) {
    if (!confirm('Retirer cet utilisateur de l\'équipe ?')) return
    await sb.from('user_roles').delete().eq('id', memberId)
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <Spinner size={28} />
    </div>
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* En-tête */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
          👥 Équipe — {tenantName ?? ''}
        </h2>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
          Gérez les accès des membres de votre espace.
        </p>
      </div>

      {/* Liste des membres */}
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 14 }}>
          Membres actuels
        </div>

        {members.length === 0 ? (
          <div style={{ color: '#334155', fontSize: 13 }}>Aucun membre trouvé.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(m => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: `${roleColor(m.role)}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: roleColor(m.role),
                }}>
                  {m.role[0].toUpperCase()}
                </div>

                {/* ID utilisateur */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                    {m.user_id.slice(0, 16)}…
                  </div>
                </div>

                {/* Rôle (modifiable si admin) */}
                {isAdmin ? (
                  <select
                    value={m.role}
                    disabled={changingRole === m.id}
                    onChange={e => handleRoleChange(m.id, e.target.value)}
                    style={{ ...inp, padding: '5px 10px', fontSize: 12, cursor: 'pointer', minWidth: 130 }}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: `${roleColor(m.role)}20`, color: roleColor(m.role),
                  }}>
                    {roleLabel(m.role)}
                  </span>
                )}

                {/* Supprimer */}
                {isAdmin && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.08)', color: '#f87171',
                      fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Retirer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inviter un membre */}
      {isAdmin && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 14 }}>
            Inviter un nouveau membre
          </div>

          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>Email *</label>
              <input
                type="email"
                placeholder="collaborateur@email.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                required
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 6 }}>Rôle</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                style={{ ...inp, width: '100%', cursor: 'pointer' }}
              >
                {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <button type="submit" disabled={inviting || !inviteEmail.trim()} style={btnPrimary}>
              {inviting ? <Spinner size={14} /> : '✉️ Inviter'}
            </button>
          </form>

          <Msg msg={inviteMsg} />

          <div style={{ marginTop: 12, fontSize: 11, color: '#475569' }}>
            Un compte sera créé automatiquement. L'utilisateur peut se connecter immédiatement avec un mot de passe temporaire.
          </div>
        </div>
      )}
    </div>
  )
}
