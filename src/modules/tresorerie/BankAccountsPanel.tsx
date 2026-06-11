import { useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { canWrite, type Role } from '@/lib/roles'
import { useBankAccounts, useBankAccountMutations, type BankAccount } from './useBankAccounts'

interface Props {
  selCo: string[]
  /** Affiche la somme totale en haut. */
  totalLabel?: string
}

export function BankAccountsPanel({ selCo, totalLabel = 'Solde bancaire total' }: Props) {
  const role = useAppStore(s => s.role) as Role
  const isReadOnly = !canWrite(role)
  const { data, isLoading } = useBankAccounts()
  const { create, update, remove } = useBankAccountMutations()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    company_key: selCo[0] ?? '',
    label: '',
    balance: '0',
    balance_date: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  const accounts = (data?.all ?? []).filter(a => selCo.includes(a.company_key))
  const total    = accounts.reduce((s, a) => s + Number(a.balance), 0)

  const resetDraft = () => {
    setDraft({
      company_key: selCo[0] ?? '',
      label: '',
      balance: '0',
      balance_date: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setEditingId(null)
  }

  const startEdit = (a: BankAccount) => {
    setEditingId(a.id)
    setDraft({
      company_key:  a.company_key,
      label:        a.label,
      balance:      String(a.balance),
      balance_date: a.balance_date,
      notes:        a.notes ?? '',
    })
    setOpen(true)
  }

  const save = async () => {
    if (!draft.label.trim() || !draft.company_key) return
    const payload = {
      company_key:  draft.company_key,
      label:        draft.label.trim(),
      balance:      Number(draft.balance) || 0,
      balance_date: draft.balance_date,
      notes:        draft.notes.trim() || null,
    }
    try {
      if (editingId) await update(editingId, payload)
      else            await create(payload)
      resetDraft()
    } catch (e: any) {
      alert('Erreur : ' + (e?.message ?? 'inconnue'))
    }
  }

  const del = async (id: string) => {
    if (!confirm('Supprimer ce compte bancaire ?')) return
    try { await remove(id) } catch (e: any) { alert('Erreur : ' + (e?.message ?? 'inconnue')) }
  }

  const inputSt: React.CSSProperties = {
    padding: '5px 8px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1', outline: 'none',
  }

  return (
    <div style={{
      marginBottom: 16, padding: '16px 20px', borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(13,148,136,0.12))',
      border: '1px solid rgba(20,184,166,0.5)',
      boxShadow: '0 2px 12px rgba(20,184,166,0.08)',
      position: 'relative', zIndex: 1,
    }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>💳</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.3px' }}>{totalLabel}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{accounts.length} compte{accounts.length > 1 ? 's' : ''} · clique pour {open ? 'replier' : 'gérer'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: total < 0 ? 'var(--red)' : '#14b8a6' }}>
            {fmt(total)} €
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {isLoading && <div style={{ fontSize: 11, color: '#64748b' }}>Chargement…</div>}

          {!isLoading && accounts.length === 0 && (
            <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
              Aucun compte saisi pour les sociétés sélectionnées. Ajoute le solde bancaire (CCP, livret, etc.) pour qu'il serve de point de départ du prévisionnel.
            </div>
          )}

          {accounts.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
              <thead>
                <tr style={{ color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.6px' }}>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Société</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Compte</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Solde</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Au</th>
                  <th style={{ padding: '4px 6px', textAlign: 'left' }}>Notes</th>
                  <th style={{ padding: '4px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '5px 6px', color: '#94a3b8', fontWeight: 600 }}>{a.company_key}</td>
                    <td style={{ padding: '5px 6px', color: '#cbd5e1' }}>{a.label}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: a.balance < 0 ? 'var(--red)' : '#14b8a6' }}>
                      {fmt(a.balance)} €
                    </td>
                    <td style={{ padding: '5px 6px', fontFamily: 'monospace', color: '#94a3b8', fontSize: 10 }}>
                      {a.balance_date.split('-').reverse().join('/')}
                    </td>
                    <td style={{ padding: '5px 6px', color: '#64748b', fontSize: 10, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.notes ?? undefined}>
                      {a.notes ?? '—'}
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!isReadOnly && (
                        <>
                          <button onClick={() => startEdit(a)} title="Modifier"
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✎</button>
                          <button onClick={() => del(a.id)} title="Supprimer"
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!isReadOnly && (
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 130px 1fr auto', gap: 6, alignItems: 'end', padding: '8px 4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Société</label>
                <select value={draft.company_key} onChange={e => setDraft(d => ({ ...d, company_key: e.target.value }))} style={{ ...inputSt, width: '100%' }}>
                  {selCo.map(co => <option key={co} value={co}>{co}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Libellé</label>
                <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="CCP, Livret A, BNP courant…" style={{ ...inputSt, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Solde (€)</label>
                <input type="number" step="0.01" value={draft.balance} onChange={e => setDraft(d => ({ ...d, balance: e.target.value }))} style={{ ...inputSt, width: '100%', fontFamily: 'monospace', textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Au</label>
                <input type="date" value={draft.balance_date} onChange={e => setDraft(d => ({ ...d, balance_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 9, color: '#94a3b8', display: 'block', marginBottom: 2 }}>Notes</label>
                <input value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="optionnel" style={{ ...inputSt, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {editingId && (
                  <button onClick={resetDraft} style={{ padding: '6px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                    Annuler
                  </button>
                )}
                <button onClick={save} disabled={!draft.label.trim() || !draft.company_key} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  cursor: (!draft.label.trim() || !draft.company_key) ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg,#14b8a6,#0d9488)', border: 'none', color: '#fff',
                  opacity: (!draft.label.trim() || !draft.company_key) ? 0.5 : 1,
                }}>
                  {editingId ? 'Mettre à jour' : '+ Ajouter'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
