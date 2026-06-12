import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { useAppStore, useTenantId } from '@/store'
import { fmt } from '@/lib/calc'
import { canWrite, type Role } from '@/lib/roles'

export interface Relance {
  id: string
  tenant_id: string
  company_key: string
  client_account: string
  client_label: string | null
  date_relance: string
  type: 'email' | 'telephone' | 'courrier' | 'mise_en_demeure' | 'autre'
  amount: number | null
  status: 'envoyee' | 'attente' | 'resolue' | 'partielle'
  notes: string | null
  created_by: string | null
  created_at: string
}

export const RELANCE_TYPE_LABELS: Record<Relance['type'], string> = {
  email: '✉️ Email',
  telephone: '📞 Téléphone',
  courrier: '📮 Courrier',
  mise_en_demeure: '⚖️ Mise en demeure',
  autre: '📝 Autre',
}

export const RELANCE_STATUS_LABELS: Record<Relance['status'], { label: string; color: string }> = {
  envoyee:   { label: 'Envoyée',           color: '#3b82f6' },
  attente:   { label: 'En attente',        color: '#f59e0b' },
  resolue:   { label: 'Résolue',           color: '#10b981' },
  partielle: { label: 'Paiement partiel',  color: '#8b5cf6' },
}

/** Fetch all relances for the current tenant, indexed by client_account. */
export function useRelances() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['relances', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await sb.from('relances').select('*').order('date_relance', { ascending: false })
      if (error) throw error
      const byAccount: Record<string, Relance[]> = {}
      for (const r of (data ?? []) as Relance[]) {
        if (!byAccount[r.client_account]) byAccount[r.client_account] = []
        byAccount[r.client_account].push(r)
      }
      return { all: (data ?? []) as Relance[], byAccount }
    },
  })
}

interface RelancesPanelProps {
  account: string
  clientLabel: string
  companyKey: string
  outstanding: number   // solde dû courant pour pré-remplir le montant
}

export function RelancesPanel({ account, clientLabel, companyKey, outstanding }: RelancesPanelProps) {
  const tenantId = useTenantId()
  const role     = useAppStore(s => s.role) as Role
  const isReadOnly = !canWrite(role)
  const qc       = useQueryClient()
  const { data } = useRelances()
  const list     = data?.byAccount?.[account] ?? []

  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'email' as Relance['type'],
    amount: outstanding > 0 ? String(Math.round(outstanding)) : '',
    status: 'envoyee' as Relance['status'],
    notes: '',
  })

  const reset = () => setForm({
    date: new Date().toISOString().slice(0, 10), type: 'email',
    amount: outstanding > 0 ? String(Math.round(outstanding)) : '',
    status: 'envoyee', notes: '',
  })

  const handleSubmit = async () => {
    if (!tenantId) return
    setBusy(true)
    const amt = parseFloat(form.amount.replace(',', '.'))
    const { error } = await sb.from('relances').insert({
      tenant_id:      tenantId,
      company_key:    companyKey,
      client_account: account,
      client_label:   clientLabel,
      date_relance:   form.date,
      type:           form.type,
      amount:         isFinite(amt) && amt > 0 ? amt : null,
      status:         form.status,
      notes:          form.notes.trim() || null,
    })
    setBusy(false)
    if (error) { alert('Erreur : ' + error.message); return }
    qc.invalidateQueries({ queryKey: ['relances'] })
    setShowForm(false); reset()
  }

  const handleStatusChange = async (id: string, status: Relance['status']) => {
    const { error } = await sb.from('relances').update({ status }).eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    qc.invalidateQueries({ queryKey: ['relances'] })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette relance ?')) return
    const { error } = await sb.from('relances').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    qc.invalidateQueries({ queryKey: ['relances'] })
  }

  const inputSt: React.CSSProperties = {
    padding: '5px 8px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', outline: 'none',
  }

  return (
    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          📞 Relances ({list.length})
        </span>
        {!isReadOnly && !showForm && (
          <button onClick={() => setShowForm(true)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
            background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa',
          }}>+ Ajouter relance</button>
        )}
      </div>

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 6, alignItems: 'end', padding: '8px 4px', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputSt} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Relance['type'] }))} style={{ ...inputSt, width: '100%' }}>
              {Object.entries(RELANCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Montant (€)</label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="optionnel" style={{ ...inputSt, width: '100%', fontFamily: 'monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Statut</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Relance['status'] }))} style={{ ...inputSt, width: '100%' }}>
              {Object.entries(RELANCE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Promesse de paiement, refus, etc." style={{ ...inputSt, width: '100%' }} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); reset() }} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 500, cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8',
            }}>Annuler</button>
            <button onClick={handleSubmit} disabled={busy} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', color: '#fff',
            }}>{busy ? '…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
          Aucune relance enregistrée.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['Date', 'Type', 'Montant', 'Statut', 'Notes', ''].map(h => (
                <th key={h} style={{ padding: '4px 6px', textAlign: h === 'Montant' ? 'right' : 'left', fontSize: 9, color: '#334155', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(r => {
              const stat = RELANCE_STATUS_LABELS[r.status]
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '5px 6px', fontFamily: 'monospace', color: '#94a3b8', fontSize: 10 }}>
                    {r.date_relance.split('-').reverse().join('/')}
                  </td>
                  <td style={{ padding: '5px 6px', color: '#cbd5e1' }}>{RELANCE_TYPE_LABELS[r.type]}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#cbd5e1' }}>
                    {r.amount != null ? `${fmt(r.amount)} €` : '—'}
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    {isReadOnly ? (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: `${stat.color}1a`, color: stat.color }}>
                        {stat.label}
                      </span>
                    ) : (
                      <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value as Relance['status'])}
                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, color: stat.color, fontSize: 10, fontWeight: 600, padding: '1px 4px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {Object.entries(RELANCE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '5px 6px', color: '#94a3b8', fontSize: 10, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes ?? undefined}>
                    {r.notes || '—'}
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                    {!isReadOnly && (
                      <button onClick={() => handleDelete(r.id)} title="Supprimer"
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface RelancesBadgeProps {
  account: string
}

/** Petit badge à afficher dans la ligne client (collapsed) avec nb relances + dernière date. */
export function RelancesBadge({ account }: RelancesBadgeProps) {
  const { data } = useRelances()
  const list = data?.byAccount?.[account] ?? []
  if (list.length === 0) return null
  const last = list[0]  // déjà trié desc par date
  const stat = RELANCE_STATUS_LABELS[last.status]
  return (
    <span title={`Dernière relance : ${last.date_relance.split('-').reverse().join('/')} — ${stat.label}`}
      style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: `${stat.color}1a`, color: stat.color }}>
      📞 {list.length}
    </span>
  )
}
