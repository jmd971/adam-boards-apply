import { useState, useMemo } from 'react'
import { sb } from '@/lib/supabase'
import { useAppStore, useTenantId } from '@/store'
import { Spinner } from '@/components/ui'
import { buildResultatTheme } from '@/hooks/useResultatTheme'

const THEME_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-theme-resultat`

// Entités du groupe pour isoler l'intra-groupe. À terme : configurable par tenant
// (aujourd'hui figé sur le groupe GBP de la démo).
const GROUP_ENTITIES = ['GBP', 'SFP', 'PRO POSE', 'PROPOSE', 'MAISON CARAIBE', 'MAISON CARAÏBE', 'OSEO', 'HOLDING']

interface ThemeJson {
  titre: string
  le_chiffre_cle: string
  ou_on_se_situe: string
  pourquoi: string
  ce_que_ca_veut_dire: string[]
  intra_groupe: string | null
}

const eur = (n: number) => (Math.round(n)).toLocaleString('fr-FR') + ' €'
const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(0)} %`

export function RapportTheme1() {
  const RAW            = useAppStore(s => s.RAW)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)
  const filters        = useAppStore(s => s.filters)
  const tenantId       = useTenantId()

  const [scope, setScope]     = useState<'societe' | 'groupe'>('societe')
  const [loading, setLoading] = useState(false)
  const [theme, setTheme]     = useState<ThemeJson | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const selCo = (filters.selCo && filters.selCo.length > 0 ? filters.selCo[0] : RAW?.keys[0]) ?? ''

  // Cutoff commun au groupe = dernier mois présent chez TOUTES les sociétés (période comparable).
  const groupCutoff = useMemo(() => {
    if (!RAW) return undefined
    const lastMonth = (k: string) => {
      const mo = Object.values(RAW.companies[k]?.pn ?? {}).flatMap(fa => Object.keys(fa.mo ?? {}))
      const sorted = [...mo].sort()
      return sorted.length ? sorted[sorted.length - 1] : ''
    }
    const maxes = RAW.keys.map(lastMonth).filter(Boolean).sort()
    return maxes[0]   // min des max = période commune la plus courte
  }, [RAW])

  const themeData = useMemo(() => {
    if (!RAW) return null
    const keys = scope === 'groupe' ? RAW.keys : [selCo]
    return buildResultatTheme(RAW, fiscalSettings, keys, GROUP_ENTITIES,
      scope === 'groupe' ? { cutoffMonth: groupCutoff } : {})
  }, [RAW, fiscalSettings, scope, selCo, groupCutoff])

  const label = scope === 'groupe'
    ? 'Groupe (toutes sociétés)'
    : (RAW?.companies[selCo]?.name || selCo)

  const generer = async () => {
    if (!themeData || !tenantId) return
    setLoading(true); setError(null); setTheme(null)
    try {
      let { data: { session } } = await sb.auth.getSession()
      if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000)) {
        const { data: refreshed } = await sb.auth.refreshSession()
        session = refreshed.session ?? session
      }
      if (!session?.access_token) { setError('Session expirée — reconnectez-vous.'); return }
      const resp = await fetch(THEME_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ themeData: { ...themeData, companyLabel: label, scope }, tenantId }),
      }).catch(() => null)
      if (!resp) { setError('Service indisponible (erreur réseau).'); return }
      const json = await resp.json()
      if (!resp.ok) { setError(json.error ?? 'Erreur lors de la génération.'); return }
      setTheme(json.themeJson as ThemeJson)
    } finally {
      setLoading(false)
    }
  }

  if (!themeData) return null

  const t = themeData
  const varN1 = t.resultatN1 !== 0 ? ((t.resultatN - t.resultatN1) / Math.abs(t.resultatN1)) * 100 : null

  const tabBtn = (s: 'societe' | 'groupe', txt: string) => (
    <button onClick={() => { setScope(s); setTheme(null) }}
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: '1px solid ' + (scope === s ? 'rgba(139,92,246,0.5)' : '#dde1ea'),
        background: scope === s ? 'rgba(139,92,246,0.18)' : 'transparent',
        color: scope === s ? '#6b5fd0' : 'var(--text-2)',
      }}>{txt}</button>
  )

  return (
    <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-0)' }}>🧭 Rapport par thèmes <span style={{ fontSize: 10.5, color: '#6b5fd0', background: 'rgba(139,92,246,0.15)', padding: '2px 7px', borderRadius: 6, marginLeft: 6 }}>β</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            Thème 1 — Le résultat, en clair · <strong style={{ color: 'var(--text-2)' }}>{label}</strong> · hors OD · {t.nbMois} mois{!t.periodeComplete ? ' (à même période)' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {tabBtn('societe', 'Par société')}
          {tabBtn('groupe', 'Groupe')}
          <button onClick={generer} disabled={loading}
            style={{ background: loading ? '#475569' : 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading ? <Spinner size={14} /> : '✨'} {loading ? 'Rédaction…' : theme ? 'Régénérer' : 'Générer le thème'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#b33b38', fontSize: 13, marginBottom: 14 }}>⚠️ {error}</div>
      )}

      {/* Chiffres clés (toujours visibles) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <MiniKpi label={`Résultat (hors OD)`} value={eur(t.resultatN)} sub={`N-1 : ${eur(t.resultatN1)} (${pct(varN1)})`} accent={t.resultatN >= 0 ? '#10b981' : '#ef4444'} />
        {t.hasBudget && <MiniKpi label="vs Budget" value={pct(t.resultatBudget !== 0 ? ((t.resultatN - t.resultatBudget) / Math.abs(t.resultatBudget)) * 100 : null)} sub={`Budget : ${eur(t.resultatBudget)}`} />}
        <MiniKpi label="Produits" value={eur(t.produitsN)} sub={`N-1 ${eur(t.produitsN1)}`} />
        <MiniKpi label="Charges" value={eur(t.chargesN)} sub={`N-1 ${eur(t.chargesN1)}`} />
      </div>

      {/* Narration IA */}
      {theme && (
        <div style={{ marginBottom: 8 }}>
          {theme.titre && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-0)', marginBottom: 12 }}>{theme.titre}</div>}
          <Bloc n="1" titre="Le chiffre clé" texte={theme.le_chiffre_cle} />
          <Bloc n="2" titre="Où on se situe" texte={theme.ou_on_se_situe} />
          <Bloc n="3" titre="Pourquoi" texte={theme.pourquoi} />
          {theme.ce_que_ca_veut_dire?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#6b5fd0', marginBottom: 6 }}>👉 Ce que ça veut dire pour piloter</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-1)', fontSize: 13, lineHeight: 1.7 }}>
                {theme.ce_que_ca_veut_dire.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {theme.intra_groupe && (
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b9721f', marginBottom: 5 }}>🔗 Flux intra-groupe (analysés à part)</div>
              <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7 }}>{theme.intra_groupe}</div>
            </div>
          )}
        </div>
      )}

      {/* Flux intra-groupe détectés (données, toujours visibles s'il y en a) */}
      {t.intraGroup.length > 0 && (
        <div style={{ marginTop: 6, marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Flux intra-groupe détectés</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {t.intraGroup.map((f, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--text-1)', background: '#f2f5f9', border: '1px solid #e0e4ec', borderRadius: 8, padding: '4px 9px' }}>
                {f.company} → {f.entity} · <span style={{ color: 'var(--text-3)' }}>{f.label}</span> · <strong>{eur(f.montantN)}</strong>
                <span style={{ color: 'var(--text-3)' }}> (N-1 {eur(f.montantN1)})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Annexe mensuelle */}
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>📅 Le résultat mois par mois (annexe)</summary>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: 'var(--text-3)', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Mois</th>
                {t.monthly.map(m => <th key={m.month} style={{ padding: '4px 8px' }}>{m.month}</th>)}
                <th style={{ padding: '4px 8px', borderLeft: '1px solid #e0e4ec' }}>Cumul</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'monospace' }}>
              <Row label={`Résultat ${t.exerciceN}`} vals={t.monthly.map(m => m.resultatN)} total={t.resultatN} color="#10b981" />
              <Row label={`Résultat ${t.exerciceN1}`} vals={t.monthly.map(m => m.resultatN1)} total={t.resultatN1} color="var(--text-2)" />
              {t.hasBudget && <Row label="Budget" vals={t.monthly.map(m => m.budget ?? 0)} total={t.resultatBudget} color="#1266a0" />}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Row({ label, vals, total, color }: { label: string; vals: number[]; total: number; color: string }) {
  return (
    <tr style={{ borderTop: '1px solid #f2f5f9' }}>
      <td style={{ textAlign: 'left', padding: '4px 8px', fontFamily: 'inherit', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{label}</td>
      {vals.map((v, i) => <td key={i} style={{ padding: '4px 8px', textAlign: 'right', color }}>{Math.round(v).toLocaleString('fr-FR')}</td>)}
      <td style={{ padding: '4px 8px', textAlign: 'right', color, fontWeight: 700, borderLeft: '1px solid #e0e4ec' }}>{Math.round(total).toLocaleString('fr-FR')}</td>
    </tr>
  )
}

function MiniKpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: '#f7f9fc', border: '1px solid #e6e9f0', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent || 'var(--text-0)', marginTop: 3, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Bloc({ n, titre, texte }: { n: string; titre: string; texte: string }) {
  if (!texte) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}><span style={{ color: '#6b5fd0' }}>{n}.</span> {titre}</div>
      <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{texte}</div>
    </div>
  )
}
