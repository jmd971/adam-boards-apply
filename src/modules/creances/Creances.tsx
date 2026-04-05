import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'

const TODAY  = new Date()
const ORANGE = '#f97316'
const BUCKET_COLORS = ['#22c55e','#3b82f6','#f59e0b',ORANGE,'#ef4444']
const BUCKET_LABELS = ['Non échu','< 30 j','30–60 j','60–90 j','> 90 j']

function ageBucket(dateStr: string): number {
  if (!dateStr) return 1
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 1
  const days = Math.round((TODAY.getTime() - d.getTime()) / 86400000)
  if (days <= 0) return 0; if (days <= 30) return 1; if (days <= 60) return 2; if (days <= 90) return 3; return 4
}

export function Creances() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const selCo   = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const { clients, buckets, totalCreances, dso } = useMemo(() => {
    if (!RAW) return { clients: [], buckets: [0,0,0,0,0], totalCreances: 0, dso: null }
    const byClient: Record<string, { name:string; montant:number; oldest:string }> = {}
    const buckets = [0,0,0,0,0]

    for (const co of selCo) {
      const bn = RAW.companies[co]?.bn ?? {}
      for (const [acc, acctData] of Object.entries(bn)) {
        if (!acc.startsWith('411')) continue
        const data   = acctData as any
        const solde  = data?.s ?? 0
        const lbl    = data?.l || acc
        const entries: any[] = data?.e ?? []
        const top: any[]     = data?.top ?? []

        if (entries.length > 0) {
          for (const e of entries) {
            const montant = Math.round(((e[3]||0) - (e[2]||0)) * 100) / 100
            if (montant <= 0) continue
            const dateStr = String(e[0] || '')
            const bk      = ageBucket(dateStr)
            const key     = e[1] ? String(e[1]).slice(0,30) : acc
            if (!byClient[key]) byClient[key] = { name:key, montant:0, oldest:dateStr }
            byClient[key].montant += montant
            if (!byClient[key].oldest || dateStr < byClient[key].oldest) byClient[key].oldest = dateStr
            buckets[bk] += montant
          }
        } else if (top.length > 0) {
          for (const t of top) {
            const [name,, montant] = t
            if ((montant||0) <= 0) continue
            if (!byClient[name]) byClient[name] = { name: String(name), montant:0, oldest:'' }
            byClient[name].montant += montant
            buckets[1] += montant
          }
        } else if (solde > 0) {
          if (!byClient[acc]) byClient[acc] = { name:lbl, montant:0, oldest:'' }
          byClient[acc].montant += solde
          buckets[1] += solde
        }
      }
    }

    const clients = Object.values(byClient).filter(c => c.montant > 0).sort((a,b) => b.montant - a.montant)
    const totalCreances = Math.round(clients.reduce((s,c) => s + c.montant, 0))
    const roundBuckets  = buckets.map(v => Math.round(v))

    // DSO depuis CA
    let ca = 0
    if (RAW.mn?.length) {
      for (const m of RAW.mn) {
        for (const co of selCo) {
          const pn = RAW.companies[co]?.pn ?? {}
          for (const [acc, data] of Object.entries(pn)) {
            if (!['706','707','708'].some(p => acc.startsWith(p))) continue
            const mo = (data as any)?.mo?.[m]
            if (mo && Array.isArray(mo)) ca += Math.max(0, mo[1] - mo[0])
          }
        }
      }
    }
    const caMensuel = RAW.mn?.length ? ca / RAW.mn.length : 0
    const dso = caMensuel > 0 ? Math.round(totalCreances / caMensuel * 30) : null

    return { clients, buckets: roundBuckets, totalCreances, dso }
  }, [RAW, selCo.join(',')])

  if (!RAW) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'var(--text-2)', fontSize:13 }}>Aucune donnée.</div>

  const totalBuckets = buckets.reduce((s,v) => s+v, 0)

  return (
    <div style={{ padding:'20px 24px', maxWidth:960 }}>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 18px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6 }}>Total créances clients</div>
          <div style={{ fontSize:26, fontWeight:800, fontFamily:'monospace', color:'var(--amber)' }}>{fmt(totalCreances)} €</div>
          <div style={{ fontSize:11, color:'var(--text-2)', marginTop:4 }}>{clients.length} client{clients.length>1?'s':''} avec solde positif</div>
        </div>
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 18px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6 }}>DSO — Délai moyen client</div>
          <div style={{ fontSize:26, fontWeight:800, fontFamily:'monospace', color: dso ? (dso>60?'var(--red)':dso>30?'var(--amber)':'var(--green)') : 'var(--text-2)' }}>
            {dso !== null ? `${dso} j` : '—'}
          </div>
          <div style={{ fontSize:11, color:'var(--text-2)', marginTop:4 }}>Objectif : &lt; 45 jours</div>
        </div>
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 18px', border:`1px solid ${buckets[4]>0?'rgba(239,68,68,0.3)':'var(--border-1)'}` }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--red)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6 }}>Créances &gt; 90 jours</div>
          <div style={{ fontSize:26, fontWeight:800, fontFamily:'monospace', color:buckets[4]>0?'var(--red)':'var(--green)' }}>{fmt(buckets[4])} €</div>
          <div style={{ fontSize:11, color:'var(--text-2)', marginTop:4 }}>
            {totalBuckets>0?`${Math.round(buckets[4]/totalBuckets*100)}% des créances`:'Aucune créance ancienne'}
          </div>
        </div>
      </div>

      {/* Barre vieillissement */}
      {totalBuckets > 0 && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)', marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:14 }}>📊 Répartition par ancienneté</div>
          <div style={{ display:'flex', height:24, borderRadius:6, overflow:'hidden', marginBottom:12, gap:1 }}>
            {BUCKET_LABELS.map((_, i) => {
              const p = totalBuckets > 0 ? (buckets[i]/totalBuckets)*100 : 0
              if (p < 0.5) return null
              return <div key={i} style={{ width:`${p}%`, background:BUCKET_COLORS[i], opacity:0.8 }} title={`${BUCKET_LABELS[i]}: ${fmt(buckets[i])} €`} />
            })}
          </div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {BUCKET_LABELS.map((label, i) => {
              if (buckets[i] === 0) return null
              const p = totalBuckets > 0 ? (buckets[i]/totalBuckets)*100 : 0
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                  <span style={{ width:10, height:10, borderRadius:2, background:BUCKET_COLORS[i], flexShrink:0 }} />
                  <span style={{ color:'var(--text-2)' }}>{label}</span>
                  <span style={{ fontFamily:'monospace', fontWeight:600, color:BUCKET_COLORS[i] }}>{fmt(buckets[i])} €</span>
                  <span style={{ color:'var(--text-3)' }}>({Math.round(p)}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tableau clients */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border-1)', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-0)' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.8px' }}>👥 Détail par client</span>
        </div>
        {clients.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--text-3)', fontSize:12 }}>
            <div style={{ fontSize:28, marginBottom:10 }}>📋</div>
            Aucun compte 411 avec solde positif détecté dans le FEC.
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                {['#','Client','Montant dû','% total','Ancienneté (approx.)','Risque'].map((h,i) => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:i>=2?'right':'left', color:'var(--text-2)', fontWeight:600, borderBottom:'1px solid var(--border-1)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((client, i) => {
                const pctTotal = totalCreances > 0 ? (client.montant/totalCreances)*100 : 0
                const bk = client.oldest ? ageBucket(client.oldest) : 1
                const isHigh = pctTotal > 30
                const isOld  = bk >= 3
                return (
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)', background: isOld ? 'rgba(239,68,68,0.03)' : isHigh ? 'rgba(245,158,11,0.03)' : 'transparent' }}>
                    <td style={{ padding:'8px 12px', color:'var(--text-3)', fontSize:10, width:30 }}>{i+1}</td>
                    <td style={{ padding:'8px 12px', color:'var(--text-1)', fontWeight: isHigh ? 600 : 400 }}>
                      {(isHigh || isOld) && <span style={{ marginRight:5, fontSize:10 }}>{isOld ? '🔴' : '⚠️'}</span>}
                      {client.name}
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color: client.montant > 10000 ? 'var(--amber)' : 'var(--text-0)' }}>
                      {fmt(client.montant)} €
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'right' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                        <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,0.06)', width:60, overflow:'hidden' }}>
                          <div style={{ height:'100%', background:isHigh?'var(--amber)':'var(--blue)', width:`${Math.min(100,pctTotal)}%`, opacity:0.8 }} />
                        </div>
                        <span style={{ color:'var(--text-2)', minWidth:35, textAlign:'right' }}>{pctTotal.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:BUCKET_COLORS[bk] }}>{BUCKET_LABELS[bk]}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right' }}>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:9, fontWeight:700,
                        background: `${BUCKET_COLORS[bk]}18`, color:BUCKET_COLORS[bk] }}>
                        {bk === 0 ? 'OK' : bk === 1 ? 'Normal' : bk === 2 ? 'Attention' : bk === 3 ? 'Urgent' : 'Critique'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'rgba(255,255,255,0.025)', borderTop:'2px solid var(--border-1)' }}>
                <td />
                <td style={{ padding:'8px 12px', fontWeight:700, color:'var(--text-0)' }}>TOTAL</td>
                <td style={{ padding:'8px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'var(--amber)' }}>{fmt(totalCreances)} €</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <div style={{ marginTop:10, fontSize:10, color:'var(--text-3)' }}>
        * Comptes 411xxx du Grand Livre. DSO = créances / CA moyen mensuel × 30. &gt;30% = risque concentration ⚠️. &gt;90j = risque impayé 🔴.
      </div>
    </div>
  )
}
