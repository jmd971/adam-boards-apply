import { useState, useMemo } from 'react'
import { sb } from '@/lib/supabase'
import { useAppStore, useTenantId } from '@/store'
import { Spinner } from '@/components/ui'
import { useRapportData, type CompteLigne, type TiersDelai } from '@/hooks/useRapportData'
import { currentFiscalYear, fiscalYearOf, monthLabel } from '@/lib/calc'
import { RapportTheme1 } from './RapportTheme1'
import { RapportMethode } from './RapportMethode'

const RAPPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-rapport`

/** Plage de mois (YYYY-MM) de l'exercice courant, ou null = exercice complet à date. */
type Period = { startM: string; endM: string } | null

interface PlanAction { priorite: 'haute' | 'moyenne' | 'basse'; cible: string; constat: string; action: string; impact?: string }
interface RapportIA {
  titre: string
  essentiel: string[]
  produits: string[]
  charges: string[]
  immobilisations?: string[] | null
  delais_clients: string[]
  delais_fournisseurs: string[]
  points_forts: string[]
  alertes: string[]
  plan_action: PlanAction[]
}

// Séparateur de milliers visible : espace insécable normale (U+00A0), + avant le €.
const NBSP = String.fromCharCode(0x00a0)
const eur = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/[\u202f\u2009\u00a0]/g, NBSP) + NBSP + '€'
const jour = (n: number | null) => n != null ? `${Math.round(n)} j` : '—'
const pct = (n: number | null) => n != null ? `${n >= 0 ? '+' : ''}${Math.round(n)} %` : '—'
const varColor = (n: number | null, inverse = false) => n == null ? 'var(--text-3)' : (inverse ? n > 0 : n < 0) ? '#10b981' : (inverse ? n < 0 : n > 0) ? '#ef4444' : 'var(--text-2)'

export function Rapport() {
  const tenantId   = useTenantId()
  const filters    = useAppStore(s => s.filters)
  const RAW            = useAppStore(s => s.RAW)
  const fiscalSettings = useAppStore(s => s.fiscalSettings)
  const [loading, setLoading] = useState(false)
  const [rapport, setRapport] = useState<RapportIA | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [period, setPeriod]   = useState<Period>(null)

  const data = useRapportData(period)

  // Mois de l'exercice courant présents dans les données → options du sélecteur.
  const availableMonths = useMemo(() => {
    if (!RAW) return [] as string[]
    const keys = (filters.selCo && filters.selCo.length > 0 ? filters.selCo : RAW.keys).filter(k => RAW.companies[k])
    const startMonth = fiscalSettings[keys[0]] ?? 1
    const exN = currentFiscalYear(startMonth)
    return (RAW.mn ?? [])
      .filter(m => keys.some(k => fiscalYearOf(m, fiscalSettings[k] ?? startMonth) === exN))
      .sort()
  }, [RAW, filters.selCo, fiscalSettings])

  const companyKey = useMemo(
    () => (filters.selCo && filters.selCo.length > 0 ? filters.selCo[0] : data?.companyKeys[0] ?? 'all'),
    [filters.selCo, data?.companyKeys]
  )

  const generer = async () => {
    if (!data || !tenantId) return
    setLoading(true); setError(null); setRapport(null)
    try {
      let { data: { session } } = await sb.auth.getSession()
      if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000)) {
        const { data: refreshed } = await sb.auth.refreshSession()
        session = refreshed.session ?? session
      }
      if (!session?.access_token) { setError('Session expirée — reconnectez-vous.'); return }
      const resp = await fetch(RAPPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ rapportData: data, tenantId, companyKey }),
      }).catch(() => null)
      if (!resp) { setError('Service indisponible (erreur réseau).'); return }
      const json = await resp.json()
      if (!resp.ok) { setError(json.error ?? 'Erreur lors de la génération.'); return }
      setRapport(json.rapportJson as RapportIA)
    } finally {
      setLoading(false)
    }
  }

  if (!data) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--text-3)' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--text-1)' }}>Aucune donnée à analyser</div>
      <div style={{ fontSize:12, marginTop:6 }}>Importez un FEC pour générer le rapport d'activité.</div>
    </div>
  )

  const resVar = data.resultatN1 !== 0 ? ((data.resultatN - data.resultatN1) / Math.abs(data.resultatN1)) * 100 : null

  return (
    <div style={{ padding:'24px 28px', maxWidth:1040, margin:'0 auto' }}>
      <div className="rapport-actions" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, gap:16, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'var(--text-0)' }}>Rapport d'activité</h2>
          <div style={{ fontSize:12, color:'var(--text-3)', marginTop:4 }}>
            Exercice {data.exerciceN} vs {data.exerciceN1} vs Budget
            {!data.periodeComplete && (
              <span style={{ marginLeft:8, padding:'2px 8px', borderRadius:6, background:'rgba(245,158,11,0.15)', color:'#fcd34d', fontSize:10.5, fontWeight:700 }}>
                à même période ({data.nbMois} mois)
              </span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={generer} disabled={loading}
            style={{ background: loading ? '#475569' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700, cursor: loading ? 'wait' : 'pointer', display:'flex', alignItems:'center', gap:8 }}>
            {loading ? <Spinner size={14} /> : '✨'} {loading ? 'Analyse en cours…' : rapport ? 'Régénérer' : 'Générer le rapport'}
          </button>
          {rapport && (
            <button onClick={() => window.print()}
              style={{ background:'rgba(255,255,255,0.08)', color:'var(--text-1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              📄 Exporter en PDF
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'12px 16px', color:'#fca5a5', fontSize:13, marginBottom:20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Sélecteur de période — pilote les KPIs et la Méthode AdamBoards */}
      <PeriodPicker months={availableMonths} period={period} onChange={setPeriod} />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:24 }}>
        <Kpi label={`Résultat ${data.exerciceN}`} value={eur(data.resultatN)} sub={`${data.exerciceN1} : ${eur(data.resultatN1)} (${pct(resVar)})`} accent={data.resultatN >= 0 ? '#10b981' : '#ef4444'} />
        <Kpi label="Produits" value={eur(data.totalProduitsN)} sub={`N-1 ${eur(data.totalProduitsN1)} · Bud ${eur(data.totalProduitsBudget)}`} />
        <Kpi label="Charges" value={eur(data.totalChargesN)} sub={`N-1 ${eur(data.totalChargesN1)} · Bud ${eur(data.totalChargesBudget)}`} />
        <Kpi label="Délai moyen clients" value={jour(data.delaiMoyenClientGlobal)} accent={(data.delaiMoyenClientGlobal ?? 0) > 60 ? '#f59e0b' : undefined} />
        <Kpi label="Délai moyen fournisseurs" value={jour(data.delaiMoyenFournGlobal)} />
      </div>

      {/* Méthode AdamBoards (β) — analyse descendante résultat → écritures */}
      <RapportMethode period={period} />

      {/* Rapport par thèmes (β) — Thème 1 : le résultat */}
      <RapportTheme1 />

      {!rapport && !loading && (
        <div style={{ background:'rgba(59,130,246,0.06)', border:'1px dashed rgba(59,130,246,0.3)', borderRadius:12, padding:'24px', textAlign:'center', color:'var(--text-2)', fontSize:13, lineHeight:1.7, marginBottom:24 }}>
          Cliquez sur <strong>« Générer le rapport »</strong> pour l'analyse rédigée et les actions par client, fournisseur et poste.
        </div>
      )}

      {/* Rapport IA */}
      {rapport && (
        <div className="rapport-print">
          {rapport.titre && (
            <div style={{ fontSize:18, fontWeight:800, color:'var(--text-0)', lineHeight:1.35, marginBottom:16 }}>{rapport.titre}</div>
          )}

          <Essentiel items={rapport.essentiel ?? []} />

          <div className="rapport-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, margin:'20px 0' }}>
            <BulletCard titre="Produits" accent="#10b981" items={rapport.produits ?? []} />
            <BulletCard titre="Charges" accent="#ef4444" items={rapport.charges ?? []} />
          </div>

          {rapport.immobilisations && rapport.immobilisations.length > 0 && (
            <BulletCard titre="Immobilisations & amortissements" accent="#8b5cf6" items={rapport.immobilisations} />
          )}

          <div className="rapport-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, margin:'20px 0' }}>
            <BulletCard titre="Délais clients" accent="#f59e0b" items={rapport.delais_clients ?? []} />
            <BulletCard titre="Délais fournisseurs" accent="#ec4899" items={rapport.delais_fournisseurs ?? []} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, margin:'20px 0' }} className="rapport-grid">
            <ListBox titre="Points forts" couleur="#10b981" items={rapport.points_forts ?? []} puce="✓" />
            <ListBox titre="Points de vigilance" couleur="#ef4444" items={rapport.alertes ?? []} puce="!" />
          </div>

          <PlanActionTable rows={rapport.plan_action ?? []} />

          <div style={{ marginTop:24, paddingTop:14, borderTop:'1px solid rgba(255,255,255,0.08)', fontSize:10, color:'var(--text-3)', textAlign:'center' }}>
            Rapport généré automatiquement par AdamBoards — à valider avec votre expert-comptable.
          </div>
        </div>
      )}

      {/* Tableaux de données détaillées (toujours visibles) */}
      <TiersTable titre="Clients — délais et poids" tiers={data.clients} />
      <TiersTable titre="Fournisseurs — délais et poids" tiers={data.fournisseurs} />
      <ComptesTable titre="Charges par poste" lignes={data.chargesDetail} inverse />
      <ComptesTable titre="Produits par poste" lignes={data.produitsDetail} />
      {(data.immobilisations?.length ?? 0) > 0 && <ComptesTable titre="Immobilisations" lignes={data.immobilisations} noBudget />}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .rapport-print, .rapport-print * { visibility: visible; }
          .rapport-print { position: absolute; left: 0; top: 0; width: 100%; }
          .rapport-print *, .rapport-print { color: #1a1a1a !important; }
          .rapport-actions, .sidebar-wrapper { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function PeriodPicker({ months, period, onChange }: { months: string[]; period: Period; onChange: (p: Period) => void }) {
  if (!months.length) return null
  const last = months[months.length - 1]
  const first = months[0]
  const n = months.length

  const presets: { label: string; value: Period }[] = [
    { label: 'Exercice complet', value: null },
    ...(n > 6 ? [{ label: '6 derniers mois', value: { startM: months[n - 6], endM: last } as Period }] : []),
    ...(n > 3 ? [{ label: '3 derniers mois', value: { startM: months[n - 3], endM: last } as Period }] : []),
    ...(n > 1 ? [{ label: 'Mois en cours', value: { startM: last, endM: last } as Period }] : []),
  ]
  const isActive = (v: Period) =>
    v === null ? period === null : (period != null && period.startM === v.startM && period.endM === v.endM)

  const curStart = period?.startM ?? first
  const curEnd   = period?.endM ?? last
  const onStart = (v: string) => onChange({ startM: v, endM: v > curEnd ? v : curEnd })
  const onEnd   = (v: string) => onChange({ startM: v < curStart ? v : curStart, endM: v })

  const selStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8, padding: '5px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginRight: 2 }}>Période :</span>
      {presets.map((p, i) => {
        const on = isActive(p.value)
        return (
          <button key={i} onClick={() => onChange(p.value)}
            style={{
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 8, padding: '5px 11px',
              color: on ? '#0b1220' : 'var(--text-1)',
              background: on ? '#3b82f6' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${on ? '#3b82f6' : 'rgba(255,255,255,0.12)'}`,
            }}>
            {p.label}
          </button>
        )
      })}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>du</span>
        <select value={curStart} onChange={e => onStart(e.target.value)} style={selStyle}>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>au</span>
        <select value={curEnd} onChange={e => onEnd(e.target.value)} style={selStyle}>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </span>
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:19, fontWeight:800, color: accent ?? 'var(--text-0)' }}>{value}</div>
      {sub && <div style={{ fontSize:10.5, color:'var(--text-3)', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function Essentiel({ items }: { items: string[] }) {
  if (!items?.length) return null
  return (
    <div style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:12, padding:'14px 16px', marginBottom:18 }}>
      <div style={{ fontSize:11, fontWeight:800, color:'#60a5fa', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>⚡ L'essentiel</div>
      <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ flex:'0 0 20px', height:20, borderRadius:6, background:'#3b82f6', color:'#04122e', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>{i + 1}</span>
            <span style={{ fontSize:13.5, color:'var(--text-1)', lineHeight:1.5 }}>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BulletCard({ titre, accent, items }: { titre: string; accent: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:11, fontWeight:800, color:accent, textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:10 }}>{titre}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
            <span style={{ flexShrink:0, width:6, height:6, borderRadius:'50%', background:accent, marginTop:6 }} />
            <span style={{ fontSize:13, color:'var(--text-1)', lineHeight:1.5 }}>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanActionTable({ rows }: { rows: PlanAction[] }) {
  if (!rows?.length) return null
  const order: Record<string, number> = { haute: 0, moyenne: 1, basse: 2 }
  const sorted = [...rows].sort((a, b) => (order[a.priorite] ?? 3) - (order[b.priorite] ?? 3))
  const prioUI: Record<string, { label: string; color: string; bg: string }> = {
    haute:   { label: 'Haute',   color: '#f87171', bg: 'rgba(239,68,68,0.15)' },
    moyenne: { label: 'Moyenne', color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
    basse:   { label: 'Basse',   color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
  }
  return (
    <div style={{ marginTop:20 }}>
      <div style={{ fontSize:11, fontWeight:800, color:'#3b82f6', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Plan d'action priorisé</div>
      <div style={{ border:'1px solid rgba(59,130,246,0.25)', borderRadius:10, overflow:'hidden', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'rgba(59,130,246,0.08)' }}>
              <th style={{ ...th, width:78 }}>Priorité</th><th style={th}>Cible</th><th style={th}>Constat</th><th style={th}>Action recommandée</th><th style={{ ...th, width:110 }}>Impact</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const p = prioUI[r.priorite] ?? prioUI.basse
              return (
                <tr key={i} style={{ borderTop:'1px solid rgba(255,255,255,0.06)', verticalAlign:'top' }}>
                  <td style={td}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:p.bg, color:p.color, whiteSpace:'nowrap' }}>{p.label}</span></td>
                  <td style={{ ...td, fontWeight:700, color:'var(--text-0)' }}>{r.cible}</td>
                  <td style={td}>{r.constat}</td>
                  <td style={{ ...td, color:'#93c5fd' }}>{r.action}</td>
                  <td style={{ ...td, fontFamily:'monospace', color:'#34d399', fontWeight:700, whiteSpace:'nowrap' }}>{r.impact || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TiersTable({ titre, tiers }: { titre: string; tiers: TiersDelai[] }) {
  if (!tiers?.length) return null
  return (
    <div style={{ marginTop:24 }}>
      <div style={{ fontSize:12, fontWeight:800, color:'var(--text-1)', marginBottom:10 }}>{titre}</div>
      <div style={{ border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, overflow:'hidden', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ background:'rgba(255,255,255,0.04)' }}>
            <th style={th}>Tiers</th><th style={th}>Source</th><th style={thR}>Total N</th><th style={thR}>Nb fact.</th><th style={thR}>Délai moyen</th><th style={thR}>Poids</th><th style={thR}>Contrib. délai</th><th style={thR}>Impayés</th>
          </tr></thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={i} style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ ...td, fontWeight:700, color:'var(--text-0)' }}>{t.name}</td>
                <td style={td}><SourceBadge source={t.source} /></td>
                <td style={tdR}>{eur(t.totalN)}</td>
                <td style={tdR}>{t.nbFactures}</td>
                <td style={{ ...tdR, color: (t.delaiMoyen ?? 0) > 60 ? '#f59e0b' : 'var(--text-1)', fontWeight:700 }}>{jour(t.delaiMoyen)}</td>
                <td style={tdR}>{Math.round(t.sharePct)} %</td>
                <td style={{ ...tdR, color:(t.contributionDelai ?? 0) > 25 ? '#ef4444' : 'var(--text-2)' }}>{t.contributionDelai != null ? `${Math.round(t.contributionDelai)} j` : '—'}</td>
                <td style={{ ...tdR, color: t.nbImpayes > 0 ? '#f59e0b' : 'var(--text-3)' }}>{t.nbImpayes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ComptesTable({ titre, lignes, inverse, noBudget }: { titre: string; lignes: CompteLigne[]; inverse?: boolean; noBudget?: boolean }) {
  if (!lignes?.length) return null
  return (
    <div style={{ marginTop:24 }}>
      <div style={{ fontSize:12, fontWeight:800, color:'var(--text-1)', marginBottom:10 }}>{titre}</div>
      <div style={{ border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, overflow:'hidden', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ background:'rgba(255,255,255,0.04)' }}>
            <th style={th}>Poste</th><th style={thR}>Total N</th><th style={thR}>N-1 (m.p.)</th><th style={thR}>Var.</th>
            {!noBudget && <th style={thR}>Budget</th>}{!noBudget && <th style={thR}>vs Bud.</th>}
            <th style={thR}>Fréq.</th><th style={thR}>Moy./écr.</th><th style={thR}>Poids</th>
          </tr></thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i} style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                <td style={td}><span style={{ color:'var(--text-3)', fontFamily:'monospace', fontSize:10.5 }}>{l.account}</span> {l.label}</td>
                <td style={{ ...tdR, fontWeight:700, color:'var(--text-0)' }}>{eur(l.totalN)}</td>
                <td style={tdR}>{eur(l.totalN1)}</td>
                <td style={{ ...tdR, color:varColor(l.varN1Pct, inverse) }}>{pct(l.varN1Pct)}</td>
                {!noBudget && <td style={tdR}>{eur(l.budget)}</td>}
                {!noBudget && <td style={{ ...tdR, color:varColor(l.varBudgetPct, inverse) }}>{pct(l.varBudgetPct)}</td>}
                <td style={tdR}>{l.frequency}</td>
                <td style={tdR}>{eur(l.avgAmount)}</td>
                <td style={tdR}>{Math.round(l.sharePct)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ListBox({ titre, couleur, items, puce }: { titre: string; couleur: string; items: string[]; puce: string }) {
  return (
    <div style={{ background:`${couleur}11`, border:`1px solid ${couleur}33`, borderRadius:12, padding:'16px 18px' }}>
      <div style={{ fontSize:11, fontWeight:800, color:couleur, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>{titre}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
        {(items ?? []).length === 0 && <span style={{ fontSize:12, color:'var(--text-3)' }}>—</span>}
        {(items ?? []).map((it, i) => (
          <div key={i} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
            <span style={{ width:16, height:16, borderRadius:'50%', background:`${couleur}33`, color:couleur, fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>{puce}</span>
            <span style={{ fontSize:12.5, color:'var(--text-1)', lineHeight:1.55 }}>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourceBadge({ source }: { source: 'FEC' | 'saisie' | 'FEC+saisie' }) {
  const map = {
    'FEC':        { bg:'rgba(59,130,246,0.15)',  color:'#60a5fa' },
    'saisie':     { bg:'rgba(148,163,184,0.15)', color:'#94a3b8' },
    'FEC+saisie': { bg:'rgba(16,185,129,0.15)',  color:'#34d399' },
  }[source]
  return <span style={{ background:map.bg, color:map.color, fontSize:9.5, fontWeight:700, padding:'2px 7px', borderRadius:6, whiteSpace:'nowrap' }}>{source}</span>
}

const th: React.CSSProperties  = { textAlign:'left', padding:'9px 12px', fontSize:10, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.4px' }
const thR: React.CSSProperties = { ...th, textAlign:'right' }
const td: React.CSSProperties  = { padding:'9px 12px', color:'var(--text-1)' }
const tdR: React.CSSProperties = { ...td, textAlign:'right' }
