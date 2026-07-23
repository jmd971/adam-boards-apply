import { useState } from 'react'
import { sb } from '@/lib/supabase'
import { useAppStore, useTenantId } from '@/store'
import { Spinner } from '@/components/ui'
import { useMethodeRapport } from '@/hooks/useMethodeRapport'
import type { CompteAnalyse, FamilleAnalyse, GroupeAnalyse, Verdict } from '@/lib/methode'

const METHODE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-methode-rapport`

// ── Restitution IA (étape 5) — l'IA rédige, ne recalcule jamais ──────────────
interface MethodeIA {
  titre: string
  messages_cles: string[]
  lecture_ventes: string
  lecture_charges: string
  questions_comptable: { sujet: string; question: string }[]
  recommandations_saisie: string[]
}

// Séparateur de milliers visible : l'espace fine insécable (U+202F) produite par
// fr-FR est remplacée par une espace insécable normale (U+00A0), plus lisible.
const NBSP = String.fromCharCode(0x00a0)
const grp = (s: string) => s.replace(/[\u202f\u2009\u00a0]/g, NBSP)
const eur = (n: number) => grp(Math.round(n).toLocaleString('fr-FR')) + NBSP + '€'
const eurS = (n: number) => (n > 0 ? '+' : '') + grp(Math.round(n).toLocaleString('fr-FR')) + NBSP + '€'
const pct = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(0)} %`
const pts = (n: number | null) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)} pt${Math.abs(n) >= 2 ? 's' : ''}`

// ── Filtre par catégorie de variation (chips cliquables) ─────────────────────
type CatKey = 'manquant' | 'nouveau' | 'ecart' | 'autres'
const CAT_DEFS: { key: CatKey; label: string; color: string }[] = [
  { key: 'manquant', label: 'Manquants',         color: '#f87171' },
  { key: 'nouveau',  label: 'Nouveaux',          color: '#1e88c7' },
  { key: 'ecart',    label: 'Écarts de montant', color: '#fbbf24' },
  { key: 'autres',   label: 'Autres variations', color: '#94a3b8' },
]
/** Catégorie d'un groupe (compte × tiers) d'après son verdict. */
const catOfGroupe = (g: GroupeAnalyse): CatKey =>
  g.verdict === 'manquant' ? 'manquant'
  : g.verdict === 'nouveau' ? 'nouveau'
  : g.verdict === 'montant_anormal' ? 'ecart'
  : 'autres'
/** Un compte est visible si l'une de ses lignes correspond aux catégories actives. */
const compteVisible = (c: CompteAnalyse, active: Set<CatKey>): boolean =>
  active.size === 0 ? true
  : c.isOD ? active.has('autres')
  : c.groupes.some(g => active.has(catOfGroupe(g)))

const FREQ_LABELS: Record<string, string> = {
  mensuel: 'mensuel', bimestriel: 'bimestriel', trimestriel: 'trimestriel',
  semestriel: 'semestriel', annuel: 'annuel', irregulier: 'ponctuel',
}

const VERDICT_UI: Record<Verdict, { label: string; color: string; bg: string }> = {
  conforme:        { label: 'Conforme',        color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  manquant:        { label: 'Manquant',        color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  montant_anormal: { label: 'Montant inhabituel', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)' },
  nouveau:         { label: 'Nouveau',         color: '#1e88c7', bg: 'rgba(59,130,246,0.12)' },
}

export function RapportMethode({ period }: { period?: { startM: string; endM: string } | null }) {
  const data     = useMethodeRapport(period)
  const tenantId = useTenantId()
  const RAW      = useAppStore(s => s.RAW)

  const [loading, setLoading] = useState(false)
  const [ia, setIa]           = useState<MethodeIA | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [activeCats, setActiveCats] = useState<Set<CatKey>>(new Set())

  const toggleCat = (k: CatKey) => setActiveCats(prev => {
    const next = new Set(prev)
    next.has(k) ? next.delete(k) : next.add(k)
    return next
  })

  const generer = async () => {
    if (!data || !tenantId) return
    setLoading(true); setError(null); setIa(null)
    try {
      let { data: { session } } = await sb.auth.getSession()
      if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000)) {
        const { data: refreshed } = await sb.auth.refreshSession()
        session = refreshed.session ?? session
      }
      if (!session?.access_token) { setError('Session expirée — reconnectez-vous.'); return }
      const resp = await fetch(METHODE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ methodeData: data, tenantId, companyKey: data.companyKey }),
      }).catch(() => null)
      if (!resp) { setError('Service indisponible (erreur réseau).'); return }
      const json = await resp.json()
      if (!resp.ok) { setError(json.error ?? 'Erreur lors de la génération.'); return }
      setIa(json.methodeJson as MethodeIA)
    } finally {
      setLoading(false)
    }
  }

  if (!data || !RAW) return null
  const d = data
  const filtering = activeCats.size > 0

  return (
    <div style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-0)' }}>
            🧠 Méthode AdamBoards <span style={{ fontSize: 10.5, color: '#0f7a45', background: 'rgba(16,185,129,0.15)', padding: '2px 7px', borderRadius: 6, marginLeft: 6 }}>β</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            Analyse descendante du résultat vers les écritures · <strong style={{ color: 'var(--text-2)' }}>{d.companyLabel}</strong> · {d.nbMois} mois{!d.periodeComplete ? ' (à même période)' : ''}
          </div>
        </div>
        <button onClick={generer} disabled={loading}
          style={{ background: loading ? '#475569' : 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading ? <Spinner size={14} /> : '✨'} {loading ? 'Rédaction…' : ia ? 'Régénérer' : 'Générer la synthèse'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#b33b38', fontSize: 13, marginBottom: 14 }}>⚠️ {error}</div>
      )}

      {d.histoLimite && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 14px', color: '#b9721f', fontSize: 12.5, marginBottom: 14 }}>
          ⏳ Pas d'exercice précédent en base — l'analyse des écarts (attendus, manquants) sera enrichie dès l'import du FEC {d.exerciceN1}.
        </div>
      )}

      {/* Niveau 0 — cadrage : bande figée (sticky) pendant le scroll pour garder
          la vision globale du résultat tout en explorant les détails. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-1)', margin: '0 -12px 16px', padding: '8px 12px 10px', borderRadius: 10, borderBottom: '1px solid var(--border-0)', boxShadow: '0 10px 16px -12px rgba(0,0,0,0.75)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <MiniKpi label={`Résultat ${d.exerciceN}`} value={eur(d.resultatN)} sub={`${d.exerciceN1} même période : ${eur(d.resultatN1)}`} accent={d.resultatN >= 0 ? '#10b981' : '#ef4444'} />
          <MiniKpi label="Variation" value={eurS(d.variation)} sub={pct(d.variationPct)} accent={d.variation >= 0 ? '#10b981' : '#ef4444'} />
          <MiniKpi label="Résultat en % du CA" value={d.resPctCaN != null ? `${d.resPctCaN.toFixed(1)} %` : '—'} sub={`${d.exerciceN1} : ${d.resPctCaN1 != null ? d.resPctCaN1.toFixed(1) + ' %' : '—'} → ${pts(d.pointsCa)}`} accent={(d.pointsCa ?? 0) >= 0 ? '#10b981' : '#ef4444'} />
          <MiniKpi label="Chiffre d'affaires" value={eur(d.caN)} sub={`${d.exerciceN1} même période : ${eur(d.caN1)}`} />
        </div>
      </div>

      {/* Filtre par catégorie de variation — chips cliquables */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginRight: 2 }}>Filtrer les comptes :</span>
        {CAT_DEFS.map(cat => {
          const on = activeCats.has(cat.key)
          return (
            <button key={cat.key} onClick={() => toggleCat(cat.key)}
              style={{
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 8, padding: '4px 10px',
                color: on ? '#ffffff' : cat.color,
                background: on ? cat.color : '#ffffff',
                border: `1px solid ${on ? cat.color : '#dde1ea'}`,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? '#ffffff' : cat.color, display: 'inline-block' }} />
              {cat.label}
            </button>
          )
        })}
        {filtering && (
          <button onClick={() => setActiveCats(new Set())}
            style={{ fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '4px 10px', color: 'var(--text-2)', background: 'transparent', border: '1px solid #dde1ea' }}>
            ✕ Tout afficher
          </button>
        )}
      </div>

      {/* Synthèse IA */}
      {ia && (
        <div style={{ marginBottom: 16 }}>
          {ia.titre && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-0)', marginBottom: 10 }}>{ia.titre}</div>}
          {(ia.messages_cles ?? []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {ia.messages_cles.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(16,185,129,0.2)', color: '#0f7a45', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                  <span style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.6 }}>{m}</span>
                </div>
              ))}
            </div>
          )}
          {ia.lecture_ventes && <Bloc titre="Côté ventes" texte={ia.lecture_ventes} />}
          {ia.lecture_charges && <Bloc titre="Côté charges" texte={ia.lecture_charges} />}
        </div>
      )}

      {/* Niveaux 1-3 — Ventes puis Charges (ordre descendant de la méthode) */}
      <FamillesBloc titre="Produits" familles={d.produits} charge={false} exN={d.exerciceN} exN1={d.exerciceN1} histoLimite={d.histoLimite} activeCats={activeCats} />
      <FamillesBloc titre="Charges" familles={d.charges} charge exN={d.exerciceN} exN1={d.exerciceN1} histoLimite={d.histoLimite} activeCats={activeCats} />

      {filtering && d.produits.every(f => !f.comptes.some(c => compteVisible(c, activeCats))) && d.charges.every(f => !f.comptes.some(c => compteVisible(c, activeCats))) && (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 2px' }}>Aucun compte ne correspond aux catégories sélectionnées.</div>
      )}

      {/* Annexe A — questions au comptable */}
      {d.questions.length > 0 && (
        <details style={{ marginTop: 14 }} open>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#fbbf24' }}>
            📮 Annexe A — {d.questions.length} question{d.questions.length > 1 ? 's' : ''} à votre comptable
          </summary>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.questions.map((q, i) => {
              const iaQ = ia?.questions_comptable?.[i]
              return (
                <div key={i} style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{q.constat}</div>
                  <div style={{ fontSize: 12.5, color: '#b9721f', fontWeight: 600, marginTop: 4 }}>→ {iaQ?.question || q.question}</div>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* Annexe B — recommandations de saisie */}
      {(d.recos.length > 0 || (ia?.recommandations_saisie?.length ?? 0) > 0) && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>
            🛠 Annexe B — recommandations de saisie ({d.recos.length + (ia?.recommandations_saisie?.length ?? 0)})
          </summary>
          <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--text-1)', fontSize: 12.5, lineHeight: 1.7 }}>
            {d.recos.map((r, i) => <li key={`d${i}`}><strong>{r.compte} {r.compteLabel}</strong> — {r.motif}</li>)}
            {(ia?.recommandations_saisie ?? []).map((r, i) => <li key={`ia${i}`}>{r}</li>)}
          </ul>
        </details>
      )}

      <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-3)' }}>
        Chiffres et écarts calculés depuis les écritures (déterministe) — la synthèse rédigée est générée par IA et n'altère jamais les montants. À valider avec votre expert-comptable.
      </div>
    </div>
  )
}

// ── Niveau 1 : familles ──────────────────────────────────────────────────────

function FamillesBloc({ titre, familles, charge, exN, exN1, histoLimite, activeCats }: {
  titre: string; familles: FamilleAnalyse[]; charge: boolean; exN: number; exN1: number; histoLimite: boolean; activeCats: Set<CatKey>
}) {
  if (!familles.length) return null
  const filtering = activeCats.size > 0
  // Familles filtrées : on ne garde que les comptes correspondant aux catégories.
  const visible = familles
    .map(f => ({ f, comptes: f.comptes.filter(c => compteVisible(c, activeCats)) }))
    .filter(({ comptes }) => comptes.length > 0)
  if (!visible.length) return null
  const accent = charge ? '#f87171' : '#34d399'
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>{titre}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(({ f, comptes }) => (
          <details key={f.key} open={filtering} style={{ background: '#f7f9fc', border: '1px solid #e6e9f0', borderRadius: 10, padding: '8px 12px' }}>
            <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', fontSize: 12.5, listStyle: 'none' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-0)' }}>
                <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 10.5, marginRight: 6 }}>{f.key}</span>{f.label}
              </span>
              <span style={{ display: 'flex', gap: 14, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{exN1} m.p. : {eur(f.totalN1)}</span>
                <span style={{ fontWeight: 700, color: 'var(--text-0)', fontFamily: 'monospace' }}>{eur(f.totalN)}</span>
                <VarBadge v={f.variation} charge={charge} />
              </span>
            </summary>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {comptes.map(c => <CompteBloc key={c.account} c={c} charge={charge} exN={exN} exN1={exN1} histoLimite={histoLimite} activeCats={activeCats} />)}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

// ── Niveau 2 : comptes, avec décomposition de la variation ───────────────────

function CompteBloc({ c, charge, histoLimite, activeCats }: { c: CompteAnalyse; charge: boolean; exN: number; exN1: number; histoLimite: boolean; activeCats: Set<CatKey> }) {
  const chips: { label: string; val: number; color: string }[] = []
  if (Math.abs(c.manquants) >= 1)     chips.push({ label: 'manquants', val: c.manquants, color: '#f87171' })
  if (Math.abs(c.nouveaux) >= 1)      chips.push({ label: 'nouveaux', val: c.nouveaux, color: '#1e88c7' })
  if (Math.abs(c.ecartsMontant) >= 1) chips.push({ label: 'écarts de montant', val: c.ecartsMontant, color: '#fbbf24' })
  if (Math.abs(c.residuel) >= 1)      chips.push({ label: c.isOD ? 'OD / clôture' : 'autres variations', val: c.residuel, color: 'var(--text-3)' })

  const filtering = activeCats.size > 0
  // Lignes détaillées filtrées par catégorie active.
  const groupes = filtering ? c.groupes.filter(g => activeCats.has(catOfGroupe(g))) : c.groupes

  return (
    <details open={filtering} style={{ background: '#fbfcfe', border: '1px solid #eceef4', borderRadius: 8, padding: '6px 10px', marginLeft: 8 }}>
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', fontSize: 12, listStyle: 'none', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-1)' }}>
          <span style={{ color: 'var(--text-3)', fontFamily: 'monospace', fontSize: 10, marginRight: 6 }}>{c.account}</span>{c.label}
          {c.isOD && <span style={{ marginLeft: 6, fontSize: 9.5, color: 'var(--text-3)', border: '1px solid #d5dae4', borderRadius: 5, padding: '1px 5px' }}>OD</span>}
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-3)', fontSize: 10.5 }}>{eur(c.totalN1)}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-0)', fontFamily: 'monospace', fontSize: 12 }}>{eur(c.totalN)}</span>
          <VarBadge v={c.variation} charge={charge} />
        </span>
      </summary>
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0 2px' }}>
          {chips.map((ch, i) => (
            <span key={i} style={{ fontSize: 10.5, color: ch.color, background: '#ffffff', border: '1px solid #e6e9f0', borderRadius: 6, padding: '2px 8px' }}>
              {ch.label} : <strong style={{ fontFamily: 'monospace' }}>{eurS(ch.val)}</strong>
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {groupes.map((g, i) => <GroupeLigne key={i} g={g} exN1={0} histoLimite={histoLimite} />)}
        {groupes.length === 0 && !c.isOD && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '2px 0' }}>
            {filtering ? 'Aucune ligne de cette catégorie.' : 'Pas d\'écriture détaillée sur la période.'}
          </div>
        )}
      </div>
    </details>
  )
}

// ── Niveau 3 : patterns (compte × tiers) et écritures ────────────────────────

function GroupeLigne({ g, histoLimite }: { g: GroupeAnalyse; exN1: number; histoLimite: boolean }) {
  const v = g.verdict ? VERDICT_UI[g.verdict] : null
  const confNote = g.conf === 1 ? 'tiers sûr (contrepartie)' : g.conf === 2 ? 'tiers déduit du libellé' : g.conf === 3 ? 'regroupement par libellé' : 'tiers non identifié'
  return (
    <details style={{ marginLeft: 8, borderLeft: '2px solid #ebeef4', paddingLeft: 10 }}>
      <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 11.5, listStyle: 'none', flexWrap: 'wrap', padding: '2px 0' }}>
        <span style={{ color: 'var(--text-1)' }}>
          {g.tiers || <em style={{ color: 'var(--text-3)' }}>Sans tiers identifié</em>}
          <span style={{ color: 'var(--text-3)', fontSize: 10, marginLeft: 6 }}>
            {FREQ_LABELS[g.freq]}{g.montantMedian ? ` · ~${eur(g.montantMedian)}` : ''} · {g.nN1}→{g.nN} op.
          </span>
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: Math.abs(g.ecart) < 1 ? 'var(--text-3)' : 'var(--text-1)' }}>{eurS(g.ecart)}</span>
          {v && !histoLimite && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: v.color, background: v.bg, borderRadius: 6, padding: '2px 7px' }}>
              {v.label}{g.significatif && (g.verdict === 'manquant' || g.verdict === 'montant_anormal') ? ' ⚠' : ''}
            </span>
          )}
        </span>
      </summary>
      <div style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0 5px' }}>{confNote}</div>
      <EcrituresList titre={`Écritures ${'N'}`} entries={g.entriesN} />
      <EcrituresList titre="Même période N-1" entries={g.entriesN1} />
    </details>
  )
}

function EcrituresList({ titre, entries }: { titre: string; entries: { date: string; label: string; amount: number; piece: string }[] }) {
  if (!entries.length) return null
  const fmtD = (d: string) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{titre}</div>
      {entries.slice(0, 12).map((e, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: 'var(--text-2)', padding: '1px 0' }}>
          <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{fmtD(e.date)}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}{e.piece ? ` · ${e.piece}` : ''}</span>
          <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{eur(e.amount)}</span>
        </div>
      ))}
      {entries.length > 12 && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>… et {entries.length - 12} autre(s)</div>}
    </div>
  )
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function VarBadge({ v, charge }: { v: number; charge: boolean }) {
  // Pour une charge, une hausse est défavorable (rouge) ; pour un produit, favorable (vert).
  const good = charge ? v < 0 : v > 0
  const color = Math.abs(v) < 1 ? 'var(--text-3)' : good ? '#34d399' : '#f87171'
  return <span style={{ fontFamily: 'monospace', fontSize: 11, color, minWidth: 74, textAlign: 'right', display: 'inline-block' }}>{eurS(v)}</span>
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

function Bloc({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f7a45', marginBottom: 3 }}>{titre}</div>
      <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{texte}</div>
    </div>
  )
}
