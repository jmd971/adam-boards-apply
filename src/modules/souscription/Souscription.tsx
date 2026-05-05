import { useEffect, useState } from 'react'
import { sb } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { roleLabel, roleColor, type Role } from '@/lib/roles'
import { useAppStore } from '@/store'

interface Tenant { id: string; name: string }
interface UserRoleRow {
  id: string
  user_id: string
  role: string
  tenant_id: string | null
  tenant_name?: string
}
interface Subscription {
  id: string
  company_name: string
  company_key: string | null
  agency_id: string | null
  agency_name?: string
  contact_email: string | null
  user_id: string | null
  role: string | null
  status: string
  created_at: string
}

const ROLES: Role[] = ['admin', 'comptable', 'viewer']

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '20px 24px',
}

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#64748b',
  letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
  color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'rgba(59,130,246,0.8)', color: '#fff', fontSize: 13, fontWeight: 600,
}

const btnDanger: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 11, fontWeight: 600,
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 16,
      borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
      {children}
    </div>
  )
}

function Msg({ msg }: { msg: { type: 'ok'|'err'; text: string } | null }) {
  if (!msg) return null
  return (
    <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, fontSize: 12,
      background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      color: msg.type === 'ok' ? '#34d399' : '#f87171',
      border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
      {msg.text}
    </div>
  )
}

const MIGRATION_SQL = `-- Table subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_key  TEXT,
  agency_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  contact_email TEXT,
  user_id      UUID,
  role         TEXT DEFAULT 'admin',
  status       TEXT DEFAULT 'active',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read"   ON subscriptions FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "auth insert" ON subscriptions FOR INSERT WITH CHECK (auth.role()='authenticated');
CREATE POLICY "auth update" ON subscriptions FOR UPDATE USING (auth.role()='authenticated');
CREATE POLICY "auth delete" ON subscriptions FOR DELETE USING (auth.role()='authenticated');

-- Si la table existe déjà, ajouter les colonnes manquantes :
-- ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS company_key TEXT;
-- ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id UUID;
-- ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';`

export function Souscription() {
  const currentRole = useAppStore(s => s.role) as Role

  const [tenants, setTenants]           = useState<Tenant[]>([])
  const [userRoles, setUserRoles]       = useState<UserRoleRow[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading]           = useState(true)
  const [subDbExists, setSubDbExists]   = useState(true)

  // Formulaire souscription
  const [companyName,   setCompanyName]   = useState('')
  const [companyKey,    setCompanyKey]    = useState('')
  const [agencyId,      setAgencyId]      = useState('')
  const [contactEmail,  setContactEmail]  = useState('')
  const [userUuid,      setUserUuid]      = useState('')
  const [userRole,      setUserRole]      = useState<Role>('admin')
  const [savingSub,     setSavingSub]     = useState(false)
  const [subMsg,        setSubMsg]        = useState<{ type:'ok'|'err'; text:string }|null>(null)

  // Formulaire accès utilisateur (section avancée)
  const [accessUserId,  setAccessUserId]  = useState('')
  const [accessRole,    setAccessRole]    = useState<Role>('viewer')
  const [accessTenant,  setAccessTenant]  = useState('')
  const [savingAccess,  setSavingAccess]  = useState(false)
  const [accessMsg,     setAccessMsg]     = useState<{ type:'ok'|'err'; text:string }|null>(null)

  const isSuperOrCabinet = currentRole === 'superadmin' || currentRole === 'cabinet_admin'

  const refreshAll = async () => {
    const [tRes, urRes, subRes] = await Promise.all([
      sb.from('tenants').select('id, name').order('name'),
      sb.from('user_roles').select('id, user_id, role, tenant_id, tenants(name)').order('created_at', { ascending: false }),
      sb.from('subscriptions').select('*').order('created_at', { ascending: false }),
    ])
    const tList = (tRes.data ?? []) as Tenant[]
    setTenants(tList)
    setUserRoles(
      ((urRes.data ?? []) as any[]).map(r => ({
        id: r.id, user_id: r.user_id, role: r.role, tenant_id: r.tenant_id,
        tenant_name: (r.tenants as any)?.name ?? '—',
      }))
    )
    if (subRes.error?.code === '42P01') {
      setSubDbExists(false)
    } else {
      const tenantMap: Record<string,string> = {}
      tList.forEach((t: any) => { tenantMap[t.id] = t.name })
      setSubscriptions(
        ((subRes.data ?? []) as any[]).map(s => ({
          ...s,
          agency_name: s.agency_id ? tenantMap[s.agency_id] ?? '—' : '—',
        }))
      )
    }
  }

  useEffect(() => {
    refreshAll().finally(() => setLoading(false))
  }, [])

  async function handleSaveSubscription(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) { setSubMsg({ type:'err', text:'Le nom de la société est requis.' }); return }
    setSavingSub(true); setSubMsg(null)

    // 1. Si email fourni sans UUID : créer le compte via API
    let resolvedUuid = userUuid.trim()
    if (!resolvedUuid && contactEmail.trim()) {
      setSubMsg({ type:'ok', text:'Création du compte utilisateur en cours…' })
      try {
        const resp = await fetch('/api/invite-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: contactEmail.trim() }),
        })
        const json = await resp.json() as any
        if (!resp.ok) {
          setSavingSub(false)
          setSubMsg({ type:'err', text: json.error ?? 'Erreur création compte.' })
          return
        }
        resolvedUuid = json.user_id
        setUserUuid(resolvedUuid)
      } catch {
        setSavingSub(false)
        setSubMsg({ type:'err', text:'Impossible de joindre /api/invite-user. Vérifiez la variable SUPABASE_SERVICE_ROLE_KEY dans Vercel.' })
        return
      }
    }

    // 2. Insérer la souscription
    const { error: subErr } = await sb.from('subscriptions').insert({
      company_name:  companyName.trim(),
      company_key:   companyKey.trim().toUpperCase() || null,
      agency_id:     agencyId || null,
      contact_email: contactEmail.trim() || null,
      user_id:       resolvedUuid || null,
      role:          resolvedUuid ? userRole : null,
      status:        'active',
    }).select().single()

    if (subErr) {
      setSavingSub(false)
      setSubMsg({ type:'err', text: subErr.message })
      return
    }

    // 3. Lier l'utilisateur au cabinet si UUID disponible
    if (resolvedUuid && agencyId) {
      const { error: urErr } = await sb.from('user_roles').upsert({
        user_id:   resolvedUuid,
        role:      userRole,
        tenant_id: agencyId,
      }, { onConflict: 'user_id' })
      if (urErr) {
        setSavingSub(false)
        setSubMsg({ type:'err', text:`Société créée mais erreur accès : ${urErr.message}` })
        return
      }
    }

    setSavingSub(false)
    const keyPart = companyKey ? ` (${companyKey.toUpperCase()})` : ''
    const accessPart = resolvedUuid
      ? ` + compte lié (invitation envoyée à ${contactEmail || resolvedUuid.slice(0,8)+'…'}).`
      : '.'
    setSubMsg({ type:'ok', text:`"${companyName}"${keyPart} enregistrée${accessPart}` })
    setCompanyName(''); setCompanyKey(''); setAgencyId('')
    setContactEmail(''); setUserUuid('')
    await refreshAll()
  }

  async function handleSaveAccess(e: React.FormEvent) {
    e.preventDefault()
    if (!accessUserId.trim()) { setAccessMsg({ type:'err', text:'UUID requis.' }); return }
    setSavingAccess(true); setAccessMsg(null)
    const { error } = await sb.from('user_roles').upsert({
      user_id: accessUserId.trim(), role: accessRole, tenant_id: accessTenant || null,
    }, { onConflict: 'user_id' })
    setSavingAccess(false)
    if (error) { setAccessMsg({ type:'err', text: error.message }) }
    else {
      setAccessMsg({ type:'ok', text:'Accès mis à jour.' })
      setAccessUserId('')
      await refreshAll()
    }
  }

  async function deleteSubscription(id: string) {
    if (!confirm('Supprimer cette souscription ?')) return
    await sb.from('subscriptions').delete().eq('id', id)
    setSubscriptions(prev => prev.filter(s => s.id !== id))
  }

  const statusColor = (s: string) => s === 'active' ? '#10b981' : s === 'pending' ? '#f59e0b' : '#64748b'

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
      <Spinner size={28} />
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin:'0 auto', padding:'24px 16px', display:'flex', flexDirection:'column', gap:28 }}>

      {/* ── Section Souscriptions ── */}
      <div style={card}>
        <SectionTitle>🏢 Sociétés souscriptrices</SectionTitle>

        {!subDbExists && (
          <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(245,158,11,0.1)',
            border:'1px solid rgba(245,158,11,0.3)', color:'#fbbf24', fontSize:12, marginBottom:20 }}>
            <strong>Table manquante.</strong> Exécutez ce SQL dans <strong>Supabase → SQL Editor</strong> :
            <pre style={{ marginTop:8, fontSize:10, color:'#94a3b8', whiteSpace:'pre-wrap', background:'rgba(0,0,0,0.3)', padding:'10px 12px', borderRadius:6 }}>
              {MIGRATION_SQL}
            </pre>
          </div>
        )}

        {/* Formulaire nouvelle souscription */}
        <form onSubmit={handleSaveSubscription} style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:24 }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>Nom de la société *</label>
              <input style={inp} value={companyName} onChange={e => setCompanyName(e.target.value)}
                placeholder="Ex : Cocon de Béa" disabled={!subDbExists} />
            </div>
            <div>
              <label style={lbl}>Code société</label>
              <input style={inp} value={companyKey} onChange={e => setCompanyKey(e.target.value.toUpperCase())}
                placeholder="Ex : COCON" maxLength={10} disabled={!subDbExists} />
            </div>
            <div>
              <label style={lbl}>Agence / Cabinet</label>
              <select style={sel} value={agencyId} onChange={e => setAgencyId(e.target.value)} disabled={!subDbExists}>
                <option value="">— Sélectionner —</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 200px', gap:12, alignItems:'end' }}>
            <div>
              <label style={lbl}>Email de contact *</label>
              <input style={inp} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                placeholder="contact@societe.fr" disabled={!subDbExists} />
              {contactEmail && !userUuid && (
                <div style={{ fontSize:10, color:'#10b981', marginTop:4 }}>
                  ✓ Un compte sera créé et une invitation envoyée
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>UUID (si compte existant)</label>
              <input style={{ ...inp, fontSize:11 }} value={userUuid} onChange={e => setUserUuid(e.target.value)}
                placeholder="xxxxxxxx-xxxx-… (laisser vide = créer le compte)" disabled={!subDbExists} />
            </div>
            <div>
              <label style={lbl}>Rôle</label>
              <select style={sel} value={userRole} onChange={e => setUserRole(e.target.value as Role)} disabled={!subDbExists}>
                {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                {isSuperOrCabinet && <option value="cabinet_admin">Admin Cabinet</option>}
                {currentRole === 'superadmin' && <option value="superadmin">Super Admin</option>}
              </select>
            </div>
          </div>

          <div>
            <button type="submit" style={{ ...btnPrimary, opacity: !subDbExists ? 0.4 : 1 }}
              disabled={savingSub || !subDbExists}>
              {savingSub ? <Spinner size={14} /> : '+ Créer la souscription'}
            </button>
            {!userUuid && contactEmail && (
              <span style={{ marginLeft:12, fontSize:11, color:'#64748b' }}>
                → créera le compte et enverra une invitation à {contactEmail}
              </span>
            )}
          </div>
        </form>

        <Msg msg={subMsg} />

        {/* Liste souscriptions */}
        {subscriptions.length > 0 ? (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ color:'#475569', textAlign:'left' }}>
                  {['Société','Code','Agence','Email contact','Utilisateur','Rôle','Statut','Créé le',''].map(h => (
                    <th key={h} style={{ padding:'6px 10px', borderBottom:'1px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscriptions.map(s => (
                  <tr key={s.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'8px 10px', color:'#f1f5f9', fontWeight:600 }}>{s.company_name}</td>
                    <td style={{ padding:'8px 10px' }}>
                      {s.company_key
                        ? <span style={{ fontFamily:'monospace', fontSize:11, background:'rgba(59,130,246,0.15)', color:'#93c5fd', padding:'2px 7px', borderRadius:5 }}>{s.company_key}</span>
                        : <span style={{ color:'#334155' }}>—</span>}
                    </td>
                    <td style={{ padding:'8px 10px', color:'#94a3b8' }}>{s.agency_name}</td>
                    <td style={{ padding:'8px 10px', color:'#64748b' }}>{s.contact_email || '—'}</td>
                    <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:10, color:'#475569' }}>
                      {s.user_id ? s.user_id.slice(0,8)+'…' : '—'}
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      {s.role
                        ? <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700,
                            background:`${roleColor(s.role as Role)}20`, color:roleColor(s.role as Role) }}>
                            {roleLabel(s.role as Role)}
                          </span>
                        : <span style={{ color:'#334155' }}>—</span>}
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700,
                        background:`${statusColor(s.status)}20`, color:statusColor(s.status) }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding:'8px 10px', color:'#475569', whiteSpace:'nowrap' }}>
                      {new Date(s.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding:'8px 10px' }}>
                      <button style={btnDanger} onClick={() => deleteSubscription(s.id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : subDbExists ? (
          <div style={{ textAlign:'center', color:'#334155', fontSize:12, padding:'16px 0' }}>
            Aucune souscription enregistrée
          </div>
        ) : null}
      </div>

      {/* ── Section Accès utilisateurs ── */}
      <div style={card}>
        <SectionTitle>🔐 Gestion des accès utilisateurs</SectionTitle>
        <p style={{ fontSize:12, color:'#64748b', marginBottom:16, marginTop:-8 }}>
          Attribuez ou modifiez le rôle d'un utilisateur existant.
          L'UUID se trouve dans <strong style={{ color:'#94a3b8' }}>Supabase → Authentication → Users</strong>.
        </p>

        <form onSubmit={handleSaveAccess}
          style={{ display:'grid', gridTemplateColumns:'1fr 160px 1fr auto', gap:12, alignItems:'end', marginBottom:20 }}>
          <div>
            <label style={lbl}>UUID utilisateur *</label>
            <input style={inp} value={accessUserId} onChange={e => setAccessUserId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div>
            <label style={lbl}>Rôle</label>
            <select style={sel} value={accessRole} onChange={e => setAccessRole(e.target.value as Role)}>
              {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              {isSuperOrCabinet && <option value="cabinet_admin">Admin Cabinet</option>}
              {currentRole === 'superadmin' && <option value="superadmin">Super Admin</option>}
            </select>
          </div>
          <div>
            <label style={lbl}>Cabinet / Groupe</label>
            <select style={sel} value={accessTenant} onChange={e => setAccessTenant(e.target.value)}>
              <option value="">— Aucun (multi-tenant) —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <button type="submit" style={btnPrimary} disabled={savingAccess}>
              {savingAccess ? <Spinner size={14} /> : 'Enregistrer'}
            </button>
          </div>
        </form>

        <Msg msg={accessMsg} />

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ color:'#475569', textAlign:'left' }}>
                {['User ID','Rôle','Cabinet / Groupe'].map(h => (
                  <th key={h} style={{ padding:'6px 10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {userRoles.length === 0 && (
                <tr><td colSpan={3} style={{ padding:'12px 10px', color:'#475569', textAlign:'center' }}>Aucun utilisateur</td></tr>
              )}
              {userRoles.map(ur => (
                <tr key={ur.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding:'8px 10px', fontFamily:'monospace', color:'#94a3b8', fontSize:11 }}>{ur.user_id}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700,
                      background:`${roleColor(ur.role as Role)}20`, color:roleColor(ur.role as Role) }}>
                      {roleLabel(ur.role as Role)}
                    </span>
                  </td>
                  <td style={{ padding:'8px 10px', color:'#94a3b8' }}>{ur.tenant_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
