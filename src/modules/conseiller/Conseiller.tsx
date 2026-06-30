import { useState, useMemo, useRef, useEffect } from 'react'
import { sb } from '@/lib/supabase'
import { useAppStore, useTenantId } from '@/store'
import { Spinner } from '@/components/ui'
import { useRapportData } from '@/hooks/useRapportData'

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`

// Adresse de reprise humaine — à remplacer par l'email réel du conseiller.
const CONSEILLER_EMAIL = 'contact@adamboards.fr'

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Où en est mon résultat sur la période ?',
  'Ma marge est-elle au niveau de mon objectif ?',
  'Quels postes de charges pèsent le plus ?',
  'Suis-je dans mon budget ?',
  "Qui me doit de l'argent aujourd'hui ?",
  'Ma trésorerie, où en est-elle ?',
]

export function Conseiller() {
  const data       = useRapportData()
  const tenantId   = useTenantId()
  const filters    = useAppStore(s => s.filters)
  const tenantName = useAppStore(s => s.tenantName)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const companyKey = useMemo(
    () => (filters.selCo && filters.selCo.length > 0 ? filters.selCo[0] : data?.companyKeys[0] ?? 'all'),
    [filters.selCo, data?.companyKeys]
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || loading || !tenantId) return
    setError(null)
    const history = messages.slice(-8)
    setMessages(m => [...m, { role: 'user', content: q }])
    setInput('')
    setLoading(true)
    try {
      let { data: { session } } = await sb.auth.getSession()
      if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000)) {
        const { data: refreshed } = await sb.auth.refreshSession()
        session = refreshed.session ?? session
      }
      if (!session?.access_token) { setError('Session expirée — reconnectez-vous.'); return }
      const resp = await fetch(AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          message: q,
          history,
          tenantId,
          companyKey,
          snapshot: data ?? null,
          entreprise: tenantName ?? companyKey,
          periode: data ? `exercice ${data.exerciceN}` : undefined,
        }),
      }).catch(() => null)
      if (!resp) { setError('Service indisponible (erreur réseau).'); return }
      const json = await resp.json()
      if (!resp.ok) { setError(json.error ?? 'Erreur lors de la réponse.'); return }
      setMessages(m => [...m, { role: 'assistant', content: json.answer as string }])
    } finally {
      setLoading(false)
    }
  }

  const empty = messages.length === 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', maxWidth:860, margin:'0 auto', padding:'16px 20px 0' }}>
      {/* En-tête */}
      <div style={{ marginBottom:12 }}>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:'var(--text-0)' }}>Mon conseiller</h2>
        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:4 }}>
          Posez vos questions de gestion — l'assistant répond à partir de vos chiffres réels.
        </div>
      </div>

      {/* Disclaimer permanent (garde-fou N3) */}
      <div style={{ background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.30)', borderRadius:10, padding:'9px 13px', color:'#fcd34d', fontSize:11.5, lineHeight:1.5, marginBottom:12 }}>
        Cet assistant analyse vos données de gestion ADAM. Il ne remplace pas un conseil fiscal,
        juridique ou comptable. Pour toute décision importante, parlez-en à votre conseiller.
      </div>

      {/* Fil de conversation */}
      <div ref={scrollRef} style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, paddingRight:4 }}>
        {empty && (
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:10 }}>Quelques questions pour démarrer :</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:10 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} disabled={loading}
                  style={{ textAlign:'left', background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.25)', borderRadius:10, padding:'11px 14px', fontSize:12.5, color:'var(--text-1)', cursor:'pointer', lineHeight:1.4 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth:'82%', borderRadius:12, padding:'11px 14px', fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap',
              background: m.role === 'user' ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'rgba(255,255,255,0.05)',
              color: m.role === 'user' ? '#fff' : 'var(--text-1)',
              border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text-3)', fontSize:12 }}>
            <Spinner size={14} /> L'assistant analyse vos chiffres…
          </div>
        )}
      </div>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'9px 13px', color:'#fca5a5', fontSize:12.5, margin:'10px 0 0' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Saisie + reprise humaine */}
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', padding:'12px 0 16px' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Écrivez votre question…"
          rows={1}
          style={{ flex:1, resize:'none', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, padding:'11px 14px', fontSize:13, color:'var(--text-0)', fontFamily:'inherit', lineHeight:1.5, maxHeight:120 }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? '#475569' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:10, padding:'11px 18px', fontSize:13, fontWeight:700, cursor: loading || !input.trim() ? 'default' : 'pointer' }}>
          Envoyer
        </button>
        <a href={`mailto:${CONSEILLER_EMAIL}?subject=Demande%20-%20Mon%20conseiller%20ADAM`}
          style={{ background:'rgba(255,255,255,0.06)', color:'var(--text-1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'11px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', textDecoration:'none', whiteSpace:'nowrap' }}>
          Parler à mon conseiller
        </a>
      </div>
    </div>
  )
}
