import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb } from '@/lib/supabase'
import { parseFEC, detectCompany, detectPeriod } from '@/lib/fec'
import { useAppStore } from '@/store'
import { Spinner } from '@/components/ui'
import type { DepositLink, Deposit } from '@/types'

/* ── Section: Gestion des liens ─────────────────────────────────────────── */

function LinkManager() {
  const user = useAppStore(s => s.user)
  const tenantId = useAppStore(s => s.tenantId)
  const RAW = useAppStore(s => s.RAW)
  const companies = RAW?.keys ?? []

  const [form, setForm] = useState({ company_key: '', label: '', period: 'N' })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data: links = [], isLoading } = useQuery<DepositLink[]>({
    queryKey: ['deposit_links'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await sb.from('deposit_links')
        .select('*')
        .order('created_at', { ascending: false })
      return (data ?? []) as DepositLink[]
    },
  })

  const createLink = useCallback(async () => {
    if (!form.company_key) return
    setCreating(true)
    await sb.from('deposit_links').insert({
      tenant_id: tenantId,
      company_key: form.company_key,
      label: form.label || null,
      period: form.period,
      created_by: user?.id,
    })
    setForm({ company_key: '', label: '', period: 'N' })
    setCreating(false)
    qc.invalidateQueries({ queryKey: ['deposit_links'] })
  }, [form, user, qc])

  const toggleActive = useCallback(async (id: string, active: boolean) => {
    await sb.from('deposit_links').update({ active: !active }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['deposit_links'] })
  }, [qc])

  const copyLink = (token: string) => {
    const url = `${window.location.origin}?token=${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
        Liens de dépôt
      </h3>

      {/* Formulaire création */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap',
        marginBottom: 16, padding: '12px 16px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ flex: '1 1 160px' }}>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>Société *</div>
          <select value={form.company_key}
            onChange={e => setForm(f => ({ ...f, company_key: e.target.value }))}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: 'rgba(255,255,255,0.06)', color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
            <option value="">Sélectionner...</option>
            {companies.map(co => (
              <option key={co} value={co}>{RAW?.companies[co]?.name || co}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>Libellé (optionnel)</div>
          <input value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Ex: Dépôt mensuel Mars"
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: 'rgba(255,255,255,0.06)', color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
            }} />
        </div>
        <div style={{ flex: '0 0 90px' }}>
          <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>Période</div>
          <select value={form.period}
            onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: 'rgba(255,255,255,0.06)', color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
            <option value="N">N</option>
            <option value="N-1">N-1</option>
            <option value="N-2">N-2</option>
          </select>
        </div>
        <button onClick={createLink} disabled={!form.company_key || creating}
          style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: form.company_key ? '#3b82f6' : 'rgba(59,130,246,0.3)',
            color: '#fff', border: 'none', cursor: form.company_key ? 'pointer' : 'default',
            opacity: creating ? 0.6 : 1,
          }}>
          {creating ? '...' : '+ Créer un lien'}
        </button>
      </div>

      {/* Liste des liens */}
      {isLoading ? <Spinner size={18} /> : links.length === 0 ? (
        <div style={{ fontSize: 12, color: '#475569', padding: '12px 0' }}>
          Aucun lien créé. Créez un lien pour permettre à vos clients de déposer leurs fichiers FEC.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map(lk => (
            <div key={lk.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 8, fontSize: 12,
              background: lk.active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
              border: `1px solid ${lk.active ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'}`,
              opacity: lk.active ? 1 : 0.5,
            }}>
              <span style={{ fontWeight: 600, color: '#f1f5f9', flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lk.label || lk.company_key}
              </span>
              <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>
                {lk.period}
              </span>
              <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>
                {new Date(lk.created_at).toLocaleDateString('fr-FR')}
              </span>
              <button onClick={() => copyLink(lk.token)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: copied === lk.token ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.12)',
                  color: copied === lk.token ? '#6ee7b7' : '#93c5fd',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                }}>
                {copied === lk.token ? 'Copié !' : 'Copier le lien'}
              </button>
              <button onClick={() => toggleActive(lk.id, lk.active)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: lk.active ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                  color: lk.active ? '#fca5a5' : '#6ee7b7',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                }}>
                {lk.active ? 'Désactiver' : 'Activer'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Section: Dépôts en attente ─────────────────────────────────────────── */

function PendingDeposits() {
  const user = useAppStore(s => s.user)
  const tenantId = useAppStore(s => s.tenantId)
  const qc = useQueryClient()
  const [integrating, setIntegrating] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; company: string; period: string; months: number; entries: number; warnings: number } | null>(null)

  const { data: deposits = [], isLoading } = useQuery<Deposit[]>({
    queryKey: ['deposits'],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await sb.from('deposits')
        .select('*')
        .order('deposited_at', { ascending: false })
      return (data ?? []) as Deposit[]
    },
  })

  const pending = deposits.filter(d => d.status === 'pending')
  const history = deposits.filter(d => d.status !== 'pending')

  const integrate = useCallback(async (dep: Deposit) => {
    setIntegrating(dep.id)
    try {
      const { data: fileData, error: dlErr } = await sb.storage
        .from('fec-deposits')
        .download(dep.file_path)

      if (dlErr || !fileData) throw new Error(dlErr?.message ?? 'Téléchargement échoué')

      const text = await fileData.text()
      const parsed = parseFEC(text)
      if (!parsed) throw new Error('Format FEC non reconnu')

      const co = detectCompany(dep.file_name)
      const { period: detectedPeriod, fy } = detectPeriod(parsed.months)
      const period = dep.period || detectedPeriod

      // Preview first
      setPreview({
        id: dep.id,
        company: co,
        period,
        months: parsed.months.length,
        entries: parsed.entryCount,
        warnings: parsed.warnings?.length ?? 0,
      })

      // Upsert company_data
      const { error: upsertErr } = await sb.from('company_data').upsert({
        tenant_id: tenantId,
        company_key: dep.company_key || co,
        period,
        fiscal_year: fy,
        pl_data: parsed.plData,
        bilan_data: parsed.bilanData,
        months: parsed.months,
        entry_count: parsed.entryCount,
        source: 'depot',
        client_data: parsed.clientData,
        ve_entries: parsed.veEntries,
      }, { onConflict: 'tenant_id,company_key,period' })

      if (upsertErr) throw upsertErr

      // Mark as integrated
      await sb.from('deposits').update({
        status: 'integrated',
        integrated_at: new Date().toISOString(),
        integrated_by: user?.id,
      }).eq('id', dep.id)

      qc.invalidateQueries({ queryKey: ['deposits'] })
      qc.invalidateQueries({ queryKey: ['companyData'] })
    } catch (e: any) {
      alert(`Erreur d'intégration : ${e.message}`)
      setPreview(null)
    } finally {
      setIntegrating(null)
    }
  }, [user, qc])

  const reject = useCallback(async (id: string) => {
    const reason = prompt('Motif du rejet (optionnel) :')
    await sb.from('deposits').update({
      status: 'rejected',
      reject_reason: reason || null,
    }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['deposits'] })
  }, [qc])

  const statusStyle = (s: string) => {
    switch (s) {
      case 'integrated': return { bg: 'rgba(16,185,129,0.1)', color: '#6ee7b7', label: 'Intégré' }
      case 'rejected':   return { bg: 'rgba(239,68,68,0.1)', color: '#fca5a5', label: 'Rejeté' }
      default:           return { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24', label: 'En attente' }
    }
  }

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / 1048576).toFixed(1)} Mo`
  }

  return (
    <div>
      {/* Preview modal */}
      {preview && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#6ee7b7', marginBottom: 6 }}>
            Intégration réussie
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            {preview.company} &middot; {preview.period} &middot; {preview.months} mois &middot; {preview.entries.toLocaleString()} écritures
            {preview.warnings > 0 && <span style={{ color: '#f59e0b' }}> &middot; {preview.warnings} avertissement(s)</span>}
          </div>
          <button onClick={() => setPreview(null)} style={{
            marginTop: 8, padding: '4px 12px', borderRadius: 6, fontSize: 11,
            background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
            border: 'none', cursor: 'pointer',
          }}>Fermer</button>
        </div>
      )}

      {/* Pending */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
        Dépôts en attente
        {pending.length > 0 && (
          <span style={{
            marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
          }}>{pending.length}</span>
        )}
      </h3>

      {isLoading ? <Spinner size={18} /> : pending.length === 0 ? (
        <div style={{ fontSize: 12, color: '#475569', padding: '12px 0', marginBottom: 24 }}>
          Aucun dépôt en attente.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {pending.map(dep => (
            <div key={dep.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 8, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)', fontSize: 12,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dep.file_name}
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                  {dep.company_key} &middot; {dep.period} &middot; {formatSize(dep.file_size)} &middot; {new Date(dep.deposited_at).toLocaleString('fr-FR')}
                </div>
              </div>
              <button onClick={() => integrate(dep)}
                disabled={integrating === dep.id}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: integrating === dep.id ? 0.6 : 1, flexShrink: 0,
                }}>
                {integrating === dep.id ? 'Intégration...' : 'Intégrer'}
              </button>
              <button onClick={() => reject(dep.id)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                }}>
                Rejeter
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Historique */}
      {history.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
            Historique
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map(dep => {
              const st = statusStyle(dep.status)
              return (
                <div key={dep.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 8, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)', fontSize: 12,
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>📄</span>
                  <span style={{ flex: 1, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dep.file_name}
                  </span>
                  <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>
                    {dep.company_key} &middot; {dep.period}
                  </span>
                  <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>
                    {new Date(dep.deposited_at).toLocaleDateString('fr-FR')}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: st.bg, color: st.color, flexShrink: 0,
                  }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Module principal ───────────────────────────────────────────────────── */

export function Depot() {
  return (
    <div className="px-6 py-5" style={{ maxWidth: 900 }}>
      <h2 className="text-base font-bold text-white mb-1">Dépôts clients</h2>
      <p className="text-xs text-muted mb-6">
        Créez des liens de dépôt pour vos clients. Ils pourront déposer leurs fichiers FEC sans créer de compte.
      </p>

      <LinkManager />

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />

      <PendingDeposits />
    </div>
  )
}
