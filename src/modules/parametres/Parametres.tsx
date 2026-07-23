import { useState } from 'react'
import { useAppStore } from '@/store'
import { sb } from '@/lib/supabase'
import { buildRAW } from '@/lib/calc'
import { ENC_CATS, DEC_CATS } from '@/lib/tresoCats'
import { canWrite } from '@/lib/roles'
import type { Role } from '@/lib/roles'

const MONTH_NAMES = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

type VatCfg = { enabled: boolean; rates: Record<string, number> }

export function Parametres() {
  const RAW             = useAppStore(s => s.RAW)
  const role            = useAppStore(s => s.role) as Role
  const tenantId        = useAppStore(s => s.tenantId)
  const fiscalSettings  = useAppStore(s => s.fiscalSettings)
  const setFiscalSettings = useAppStore(s => s.setFiscalSettings)
  const vatSettings     = useAppStore(s => s.vatSettings)
  const setVatSettings  = useAppStore(s => s.setVatSettings)
  const setRAW          = useAppStore(s => s.setRAW)
  const manualEntries   = useAppStore(s => s.manualEntries)
  const setFilters      = useAppStore(s => s.setFilters)

  const [saving, setSaving] = useState<string | null>(null)
  const [saved,  setSaved]  = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  // Brouillon local d'édition des taux (avant sauvegarde sur blur)
  const [vatDraft, setVatDraft] = useState<Record<string, VatCfg>>({})
  const getVat = (co: string): VatCfg => vatDraft[co] ?? vatSettings[co] ?? { enabled: false, rates: {} }

  const companies = RAW?.keys ?? []
  const writable  = canWrite(role) && (role === 'admin' || role === 'superadmin')

  const handleSave = async (co: string, month: number) => {
    if (!tenantId) return
    setSaving(co)
    setError(null)

    const { error: err } = await sb
      .from('company_settings')
      .upsert(
        { tenant_id: tenantId, company_key: co, fiscal_year_start_month: month },
        { onConflict: 'tenant_id,company_key' }
      )

    if (err) {
      setError(`Erreur lors de la sauvegarde pour ${co} : ${err.message}`)
      setSaving(null)
      return
    }

    // Mettre à jour le store localement
    const newFiscal = { ...fiscalSettings, [co]: month }
    setFiscalSettings(newFiscal)

    // Reconstruire RAW avec les nouveaux paramètres
    const [cdRes, bdRes] = await Promise.all([
      sb.from('company_data').select('*').eq('tenant_id', tenantId),
      sb.from('budget').select('*').eq('tenant_id', tenantId),
    ])
    if (cdRes.data) {
      const newRAW = buildRAW(cdRes.data as any, (bdRes.data ?? []) as any, manualEntries, newFiscal)
      setRAW(newRAW)
      // Réajuster la période si nécessaire
      if (newRAW.mn.length > 0) {
        setFilters({ startM: newRAW.mn[0], endM: newRAW.mn[newRAW.mn.length - 1] })
      }
    }

    setSaving(null)
    setSaved(co)
    setTimeout(() => setSaved(s => s === co ? null : s), 2500)
  }

  // Sauvegarde TVA (upsert partiel : ne touche QUE vat_enabled/vat_rates, préserve
  // fiscal_year_start_month). Pas de rebuild RAW : la TVA n'affecte que le prévisionnel
  // de trésorerie, calculé en direct depuis le store.
  const handleSaveVat = async (co: string, next: VatCfg) => {
    if (!tenantId) return
    const key = `vat:${co}`
    setSaving(key)
    setError(null)
    const { error: err } = await sb
      .from('company_settings')
      .upsert(
        { tenant_id: tenantId, company_key: co, vat_enabled: next.enabled, vat_rates: next.rates },
        { onConflict: 'tenant_id,company_key' }
      )
    if (err) {
      setError(`Erreur TVA pour ${co} : ${err.message}`)
      setSaving(null)
      return
    }
    setVatSettings({ ...vatSettings, [co]: next })
    setSaving(null)
    setSaved(key)
    setTimeout(() => setSaved(s => s === key ? null : s), 2500)
  }

  const toggleVat = (co: string) => {
    const next = { ...getVat(co), enabled: !getVat(co).enabled }
    setVatDraft(d => ({ ...d, [co]: next }))
    handleSaveVat(co, next)
  }

  const editVatRate = (co: string, cat: string, raw: string) => {
    const rate = raw === '' ? 0 : Math.max(0, Math.min(100, parseFloat(raw.replace(',', '.')) || 0))
    const cur = getVat(co)
    setVatDraft(d => ({ ...d, [co]: { ...cur, rates: { ...cur.rates, [cat]: rate } } }))
  }

  const card: React.CSSProperties = {
    background: 'var(--bg-1)', borderRadius: 12, border: '1px solid var(--border-0)',
    padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12,
  }

  return (
    <div className="ab-light" style={{ padding: '28px 32px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, background:'var(--bg-0)', minHeight:'100%' }}>

      {/* En-tête */}
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-0)' }}>Paramètres</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
          Configuration des exercices fiscaux et de la TVA par société.
        </p>
      </div>

      {/* Section exercice fiscal */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)' }}>Début d'exercice fiscal</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Définit à partir de quel mois commence l'exercice N de chaque société.
              Par défaut : Janvier (exercice civil).
            </div>
          </div>
        </div>

        {companies.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
            Aucune société disponible — importez un FEC pour commencer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {companies.map(co => {
              const currentMonth = fiscalSettings[co] ?? 1
              const isSaving = saving === co
              const isSaved  = saved  === co
              const companyName = RAW?.companies[co]?.name ?? co

              return (
                <div key={co} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8,
                  background: 'rgba(20,30,60,0.03)',
                  border: '1px solid var(--border-1)',
                }}>
                  {/* Nom société */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {companyName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {co}
                    </div>
                  </div>

                  {/* Sélecteur mois */}
                  {writable ? (
                    <select
                      value={currentMonth}
                      onChange={e => handleSave(co, Number(e.target.value))}
                      disabled={isSaving}
                      style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        border: '1px solid var(--border-1)', outline: 'none', cursor: 'pointer',
                        background: 'var(--bg-0)', color: 'var(--text-0)', fontFamily: 'inherit',
                        opacity: isSaving ? 0.6 : 1,
                        minWidth: 130,
                      }}
                    >
                      {MONTH_NAMES.slice(1).map((name, i) => (
                        <option key={i + 1} value={i + 1} style={{ background: 'var(--bg-1)' }}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-1)', padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border-1)' }}>
                      {MONTH_NAMES[currentMonth]}
                    </span>
                  )}

                  {/* Statut */}
                  <div style={{ width: 80, textAlign: 'right', fontSize: 11 }}>
                    {isSaving && <span style={{ color: '#60a5fa' }}>Sauvegarde…</span>}
                    {isSaved  && <span style={{ color: '#34d399' }}>✓ Sauvegardé</span>}
                    {currentMonth !== 1 && !isSaving && !isSaved && (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                        exercice décalé
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', marginTop: 4 }}>
            {error}
          </div>
        )}

        {!writable && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 4 }}>
            🔒 Modification réservée aux administrateurs.
          </div>
        )}
      </div>

      {/* Section TVA */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🧾</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)' }}>TVA</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              Si la société est assujettie, le budget (HT) est converti en TTC dans le prévisionnel
              de trésorerie, au taux de chaque catégorie.
            </div>
          </div>
        </div>

        {companies.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
            Aucune société disponible — importez un FEC pour commencer.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {companies.map(co => {
              const vat = getVat(co)
              const companyName = RAW?.companies[co]?.name ?? co
              const isSaved = saved === `vat:${co}`
              return (
                <div key={co} style={{
                  padding: '12px 16px', borderRadius: 8,
                  background: 'rgba(20,30,60,0.03)', border: '1px solid var(--border-1)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  {/* Ligne société + toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {companyName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{co}</div>
                    </div>
                    {writable ? (
                      <button
                        onClick={() => toggleVat(co)}
                        disabled={saving === `vat:${co}`}
                        style={{
                          padding: '5px 11px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                          border: 'none', cursor: 'pointer',
                          background: vat.enabled ? 'rgba(16,185,129,0.18)' : 'var(--bg-2)',
                          color: vat.enabled ? '#34d399' : 'var(--text-2)',
                          boxShadow: vat.enabled ? 'inset 0 0 0 1px rgba(16,185,129,0.3)' : 'inset 0 0 0 1px var(--border-1)',
                        }}>
                        {vat.enabled ? '✓ Assujettie TVA' : 'Non assujettie'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{vat.enabled ? 'Assujettie' : 'Non assujettie'}</span>
                    )}
                    {isSaved && <span style={{ fontSize: 11, color: '#34d399' }}>✓</span>}
                  </div>

                  {/* Taux par catégorie (si assujettie) */}
                  {vat.enabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 16px' }}>
                      {[...ENC_CATS, ...DEC_CATS].map(c => (
                        <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, fontSize: 11.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.label}
                          </span>
                          {writable ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <input
                                type="number" step="0.1" min="0" max="100"
                                value={vat.rates[c.label] ?? ''}
                                placeholder="0"
                                onChange={e => editVatRate(co, c.label, e.target.value)}
                                onBlur={() => handleSaveVat(co, getVat(co))}
                                style={{
                                  width: 56, padding: '3px 6px', borderRadius: 5, fontSize: 11,
                                  textAlign: 'right', fontFamily: 'monospace',
                                  background: 'var(--bg-0)', color: 'var(--text-0)', border: '1px solid var(--border-1)', outline: 'none',
                                }} />
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>%</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-1)' }}>{vat.rates[c.label] ?? 0} %</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!writable && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 4 }}>
            🔒 Modification réservée aux administrateurs.
          </div>
        )}
      </div>

      {/* Explication */}
      <div style={{ ...card, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e88c7', marginBottom: 4 }}>ℹ️ Comment ça marche</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Pour un exercice <strong style={{ color: 'var(--text-1)' }}>civil (jan → déc)</strong>, choisissez <strong style={{ color: 'var(--text-1)' }}>Janvier</strong> (défaut).</li>
          <li>Pour un exercice <strong style={{ color: 'var(--text-1)' }}>oct → sep</strong>, choisissez <strong style={{ color: 'var(--text-1)' }}>Octobre</strong>.</li>
          <li>Après modification, les mois du FEC sont reclassés en N / N-1 selon l'exercice fiscal.</li>
          <li>Les graphiques, comparaisons N-1, et filtres de période se mettent à jour automatiquement.</li>
        </ul>
      </div>

    </div>
  )
}
