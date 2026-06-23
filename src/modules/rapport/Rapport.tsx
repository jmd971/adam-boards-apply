import { useState, useMemo } from 'react'
import { sb } from '@/lib/supabase'
import { useAppStore, useTenantId } from '@/store'
import { Spinner } from '@/components/ui'
import { useRapportData } from '@/hooks/useRapportData'

const RAPPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-rapport`

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

interface RapportIA {
  synthese: string
  modele_eco: string
  saisonnalite: string | null
  operations: string
  tiers: string
  paiements: string
  points_forts: string[]
  alertes: string[]
  recommandations: string[]
}

const eur = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €'

export function Rapport() {
  const data       = useRapportData()
  const tenantId   = useTenantId()
  const filters    = useAppStore(s => s.filters)
  const [loading, setLoading]   = useState(false)
  const [rapport, setRapport]   = useState<RapportIA | null>(null)
  const [error, setError]       = useState<string | null>(null)

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
      <div style={{ fontSize:12, marginTop:6 }}>Saisissez ou importez des factures pour générer un rapport d'activité.</div>
    </div>
  )

  return (
    <div style={{ padding:'24px 28px', maxWidth:980, margin:'0 auto' }}>
      {/* En-tête + actions (masqué à l'impression) */}
      <div className="rapport-actions" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, gap:16, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'var(--text-0)' }}>Rapport d'activité</h2>
          <div style={{ fontSize:12, color:'var(--text-3)', marginTop:4 }}>
            12 derniers mois &middot; du {data.periodStart} au {data.periodEnd}
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

      {/* KPIs visuels (toujours affichés, basés sur les calculs) */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:24 }}>
        <Kpi label="Chiffre d'affaires (12 mois)" value={eur(data.tendancesMensuelles.reduce((s,m)=>s+m.ventes,0))} />
        <Kpi label="Délai moyen encaissement" value={data.delaiMoyenClient != null ? `${Math.round(data.delaiMoyenClient)} j` : '—'} />
        <Kpi label="Délai moyen règlement" value={data.delaiMoyenFourn != null ? `${Math.round(data.delaiMoyenFourn)} j` : '—'} />
        <Kpi label="Paiements en retard" value={String(data.retards.length)} accent={data.retards.length > 0 ? '#f59e0b' : undefined} />
      </div>

      {!rapport && !loading && (
        <div style={{ background:'rgba(59,130,246,0.06)', border:'1px dashed rgba(59,130,246,0.3)', borderRadius:12, padding:'28px 24px', textAlign:'center', color:'var(--text-2)' }}>
          <div style={{ fontSize:13, lineHeight:1.7 }}>
            Cliquez sur <strong>« Générer le rapport »</strong> pour obtenir une analyse rédigée<br/>
            de votre activité : fonctionnement, tendances, anomalies et recommandations.
          </div>
        </div>
      )}

      {/* Rapport IA */}
      {rapport && (
        <div className="rapport-print">
          <PrintHeader periode={`${data.periodStart} → ${data.periodEnd}`} />

          <Section titre="Synthèse" accent="#3b82f6" texte={rapport.synthese} grand />
          <Section titre="Comment fonctionne votre entreprise" accent="#8b5cf6" texte={rapport.modele_eco} />
          {rapport.saisonnalite && (
            <Section titre="Saisonnalité" accent="#06b6d4" texte={rapport.saisonnalite}
              extra={data.saisonnaliteMois.length ? `Mois de pic : ${data.saisonnaliteMois.map(i=>MOIS[i]).join(', ')}.` : undefined} />
          )}
          <Section titre="Vos opérations" accent="#10b981" texte={rapport.operations} />
          <Section titre="Vos clients & fournisseurs" accent="#f59e0b" texte={rapport.tiers}
            extra={data.dependanceTiers ? `⚠️ Concentration : votre 1er client représente ${Math.round(data.concentrationClientPct)} % de vos ventes.` : undefined} />
          <Section titre="Vos paiements" accent="#ec4899" texte={rapport.paiements} />

          {/* Points forts / Alertes */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, margin:'20px 0' }} className="rapport-grid">
            <ListBox titre="Points forts" couleur="#10b981" items={rapport.points_forts} puce="✓" />
            <ListBox titre="Points de vigilance" couleur="#ef4444" items={rapport.alertes} puce="!" />
          </div>

          {/* Recommandations */}
          <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, padding:'18px 22px', marginTop:4 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'#f59e0b', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>Recommandations</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {rapport.recommandations.map((r,i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ width:20, height:20, borderRadius:'50%', background:'rgba(245,158,11,0.2)', color:'#fcd34d', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</span>
                  <span style={{ fontSize:13, color:'var(--text-1)', lineHeight:1.6 }}>{r}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop:28, paddingTop:14, borderTop:'1px solid rgba(255,255,255,0.08)', fontSize:10, color:'var(--text-3)', textAlign:'center' }}>
            Rapport généré automatiquement par AdamBoards — analyse à valider avec votre expert-comptable.
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .rapport-print, .rapport-print * { visibility: visible; }
          .rapport-print { position: absolute; left: 0; top: 0; width: 100%; color: #000 !important; }
          .rapport-print *, .rapport-print { color: #1a1a1a !important; }
          .rapport-actions, .sidebar-wrapper { display: none !important; }
        }
      `}</style>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color: accent ?? 'var(--text-0)' }}>{value}</div>
    </div>
  )
}

function Section({ titre, accent, texte, extra, grand }: { titre: string; accent: string; texte: string; extra?: string; grand?: boolean }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:11, fontWeight:800, color:accent, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>{titre}</div>
      <p style={{ margin:0, fontSize: grand ? 15 : 13, color:'var(--text-1)', lineHeight:1.7 }}>{texte}</p>
      {extra && <p style={{ margin:'8px 0 0', fontSize:12, color:'var(--text-2)', fontStyle:'italic' }}>{extra}</p>}
    </div>
  )
}

function ListBox({ titre, couleur, items, puce }: { titre: string; couleur: string; items: string[]; puce: string }) {
  return (
    <div style={{ background:`${couleur}11`, border:`1px solid ${couleur}33`, borderRadius:12, padding:'16px 18px' }}>
      <div style={{ fontSize:11, fontWeight:800, color:couleur, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>{titre}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
        {items.length === 0 && <span style={{ fontSize:12, color:'var(--text-3)' }}>—</span>}
        {items.map((it,i) => (
          <div key={i} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
            <span style={{ width:16, height:16, borderRadius:'50%', background:`${couleur}33`, color:couleur, fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>{puce}</span>
            <span style={{ fontSize:12.5, color:'var(--text-1)', lineHeight:1.55 }}>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PrintHeader({ periode }: { periode: string }) {
  return (
    <div className="print-only" style={{ display:'none' }}>
      <h1 style={{ fontSize:22, margin:'0 0 4px' }}>Rapport d'activité</h1>
      <div style={{ fontSize:12, color:'#555' }}>Période : {periode}</div>
      <hr style={{ margin:'12px 0 20px', border:'none', borderTop:'1px solid #ddd' }} />
    </div>
  )
}
