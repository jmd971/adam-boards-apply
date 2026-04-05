import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { EcrituresModal } from '@/components/ui'

const TODAY  = new Date()
const COLORS = ['#22c55e','#3b82f6','#f59e0b','#f97316','#ef4444']
const LABELS = ['Non échu','< 30 j','30–60 j','60–90 j','> 90 j']

function bucket(dateStr: string): number {
  if (!dateStr) return 1
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 1
  const days = Math.round((TODAY.getTime() - d.getTime()) / 86400000)
  if (days <= 0) return 0; if (days <= 30) return 1; if (days <= 60) return 2; if (days <= 90) return 3; return 4
}

interface ClientRow {
  name:    string
  account: string
  total:   number
  buckets: number[]   // [non échu, <30, 30-60, 60-90, >90]
  entries: any[]      // écritures individuelles
  oldest:  string
}

export function Creances() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const [modal, setModal] = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)
  const [sortKey, setSortKey] = useState<'total'|'oldest'|'name'>('total')

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const { clients, bucketTotals, totalCreances, dso } = useMemo(() => {
    if (!RAW) return { clients:[], bucketTotals:[0,0,0,0,0], totalCreances:0, dso:null }

    const map: Record<string, ClientRow> = {}

    for (const co of selCo) {
      const bn = RAW.companies[co]?.bn ?? {}
      for (const [acc, acctData] of Object.entries(bn)) {
        if (!acc.startsWith('41') || acc.startsWith('419')) continue
        const data    = acctData as any
        const entries = data?.e ?? []
        const topArr  = data?.top ?? []
        const lbl     = data?.l || acc

        if (entries.length > 0) {
          // Chaque compte 41x = 1 client — l'intitulé (lbl) EST le nom client
          const key = acc
          if (!map[key]) map[key] = { name:lbl, account:acc, total:0, buckets:[0,0,0,0,0], entries:[], oldest:'' }
          for (const e of entries) {
            const montant = Math.round(((e[3]||0) - (e[2]||0)) * 100) / 100
            if (montant <= 0) continue
            map[key].total += montant
            map[key].entries.push(e)
            map[key].buckets[bucket(String(e[0]||''))] += montant
            if (!map[key].oldest || String(e[0]) < map[key].oldest) map[key].oldest = String(e[0])
        } else if (topArr.length > 0) {
          for (const t of topArr) {
            const [cName,, montant] = t
            if ((montant||0) <= 0) continue
            const key = `${acc}__${cName}`
            if (!map[key]) map[key] = { name:String(cName), account:acc, total:0, buckets:[0,0,0,0,0], entries:[], oldest:'' }
            map[key].total += montant
            map[key].buckets[1] += montant
          }
        } else if ((data?.s||0) > 0) {
          const key = acc
          if (!map[key]) map[key] = { name:lbl, account:acc, total:0, buckets:[0,0,0,0,0], entries:[], oldest:'' }
          map[key].total += data.s
          map[key].buckets[1] += data.s
        }
      }
    }

    // Arrondir
    const clients = Object.values(map)
      .filter(c => c.total > 0)
      .map(c => ({...c, total:Math.round(c.total), buckets:c.buckets.map(v=>Math.round(v))}))

    const totalCreances  = clients.reduce((s,c)=>s+c.total,0)
    const bucketTotals   = LABELS.map((_,i)=>clients.reduce((s,c)=>s+c.buckets[i],0))

    // DSO depuis CA
    let ca = 0
    if (RAW.mn?.length) {
      for (const m of RAW.mn) {
        for (const co of selCo) {
          const pn = RAW.companies[co]?.pn ?? {}
          for (const [acc, data] of Object.entries(pn)) {
            if (!['706','707','708'].some(p=>acc.startsWith(p))) continue
            const mo = (data as any)?.mo?.[m]
            if (mo && Array.isArray(mo)) ca += Math.max(0, mo[1]-mo[0])
          }
        }
      }
    }
    const caMensuel = RAW.mn?.length ? ca/RAW.mn.length : 0
    const dso = caMensuel > 0 ? Math.round(totalCreances/caMensuel*30) : null

    return { clients, bucketTotals, totalCreances, dso }
  }, [RAW, selCo.join(',')])

  const sorted = useMemo(() => {
    return [...clients].sort((a,b) => {
      if (sortKey==='name')   return a.name.localeCompare(b.name)
      if (sortKey==='oldest') return (a.oldest||'').localeCompare(b.oldest||'')
      return b.total - a.total
    })
  }, [clients, sortKey])

  const totalB = bucketTotals.reduce((s,v)=>s+v,0)

  if (!RAW) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:256,color:'var(--text-2)',fontSize:13}}>Aucune donnée.</div>

  const Th = ({label,sk,w}:{label:string;sk?:typeof sortKey;w?:number}) => (
    <th onClick={sk?()=>setSortKey(sk):undefined}
      style={{padding:'8px 12px',textAlign:'right',color:sortKey===sk?'var(--blue)':'var(--text-2)',fontWeight:600,borderBottom:'2px solid var(--border-1)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.5px',cursor:sk?'pointer':'default',whiteSpace:'nowrap',width:w,userSelect:'none'}}>
      {label}{sk&&<span style={{marginLeft:4,fontSize:9,opacity:0.6}}>{sortKey===sk?'▼':'⇅'}</span>}
    </th>
  )

  return (
    <>
      <div style={{padding:'20px 24px'}}>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:24}}>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Total créances clients</div>
            <div style={{fontSize:28,fontWeight:800,fontFamily:'monospace',color:'var(--amber)'}}>{fmt(totalCreances)} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{clients.length} client{clients.length>1?'s':''} · cliquez pour voir les factures</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>DSO — Délai moyen</div>
            <div style={{fontSize:28,fontWeight:800,fontFamily:'monospace',color:dso?(dso>60?'var(--red)':dso>30?'var(--amber)':'var(--green)'):'var(--text-2)'}}>
              {dso!==null?`${dso} j`:'—'}
            </div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>Objectif recommandé : &lt; 45 jours</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:`1px solid ${bucketTotals[4]>0?'rgba(239,68,68,0.3)':'var(--border-1)'}`}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Créances &gt; 90 jours</div>
            <div style={{fontSize:28,fontWeight:800,fontFamily:'monospace',color:bucketTotals[4]>0?'var(--red)':'var(--green)'}}>{fmt(bucketTotals[4])} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{totalB>0?`${Math.round(bucketTotals[4]/totalB*100)}% des créances totales`:'Aucune créance ancienne ✅'}</div>
          </div>
        </div>

        {/* Barre vieillissement */}
        {totalB > 0 && (
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 20px',border:'1px solid var(--border-1)',marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>Répartition par ancienneté</div>
            <div style={{display:'flex',height:20,borderRadius:4,overflow:'hidden',marginBottom:10,gap:1}}>
              {LABELS.map((_,i)=>{
                const p = totalB>0?(bucketTotals[i]/totalB)*100:0
                if (p<0.5) return null
                return <div key={i} style={{width:`${p}%`,background:COLORS[i],opacity:0.85}} title={`${LABELS[i]}: ${fmt(bucketTotals[i])} €`}/>
              })}
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              {LABELS.map((label,i)=>{
                if (!bucketTotals[i]) return null
                const p=totalB>0?(bucketTotals[i]/totalB)*100:0
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                    <span style={{width:10,height:10,borderRadius:2,background:COLORS[i],flexShrink:0}}/>
                    <span style={{color:'var(--text-2)'}}>{label}</span>
                    <span style={{fontFamily:'monospace',fontWeight:700,color:COLORS[i]}}>{fmt(bucketTotals[i])} €</span>
                    <span style={{color:'var(--text-3)'}}>({Math.round(p)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tableau clients */}
        <div style={{borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border-0)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-0)'}}>
              👥 Créances par client
              <span style={{marginLeft:8,fontSize:10,color:'var(--text-3)',fontWeight:400}}>Cliquez sur une ligne pour voir les factures</span>
            </div>
            <div style={{display:'flex',gap:6,fontSize:10,color:'var(--text-3)'}}>
              Trier :
              {(['total','name','oldest'] as const).map(k=>(
                <button key={k} onClick={()=>setSortKey(k)}
                  style={{padding:'2px 8px',borderRadius:6,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,
                    background:sortKey===k?'rgba(59,130,246,0.2)':'rgba(255,255,255,0.04)',
                    color:sortKey===k?'#93c5fd':'var(--text-3)'}}>
                  {k==='total'?'Montant':k==='name'?'Nom':'Ancienneté'}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <div style={{padding:40,textAlign:'center',color:'var(--text-3)',fontSize:12}}>
              <div style={{fontSize:32,marginBottom:10}}>📋</div>
              Aucun compte client (411xxx) avec solde positif dans le FEC.
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead style={{position:'sticky',top:0,zIndex:5,background:'var(--bg-1)'}}>
                  <tr>
                    <th style={{padding:'8px 12px',textAlign:'left',color:'var(--text-2)',fontWeight:600,borderBottom:'2px solid var(--border-1)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.5px',minWidth:200}}>Client</th>
                    <Th label="Total dû" sk="total" w={110}/>
                    <Th label="Non échu" w={90}/>
                    <Th label="&lt; 30 j" w={80}/>
                    <Th label="30–60 j" w={80}/>
                    <Th label="60–90 j" w={80}/>
                    <Th label="&gt; 90 j" w={80}/>
                    <Th label="+ ancien" sk="oldest" w={90}/>
                    <th style={{padding:'8px 12px',textAlign:'center',color:'var(--text-2)',fontWeight:600,borderBottom:'2px solid var(--border-1)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.5px',width:80}}>Risque</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    const pct90  = totalCreances > 0 ? (c.buckets[4]/totalCreances)*100 : 0
                    const pctCli = totalCreances > 0 ? (c.total/totalCreances)*100      : 0
                    const bk     = c.buckets[4]>0 ? 4 : c.buckets[3]>0 ? 3 : c.buckets[2]>0 ? 2 : c.buckets[1]>0 ? 1 : 0
                    const risk   = bk>=4?'Critique':bk>=3?'Urgent':bk>=2?'Attention':bk>=1?'Normal':'OK'
                    const isConc = pctCli > 30

                    return (
                      <tr key={i}
                        onClick={()=>c.entries.length>0&&setModal({title:`Créances — ${c.name}`,entries:c.entries,cumN:c.total,cumN1:0})}
                        style={{borderBottom:'1px solid rgba(255,255,255,0.03)',cursor:c.entries.length>0?'pointer':'default',background:bk>=4?'rgba(239,68,68,0.04)':isConc?'rgba(245,158,11,0.03)':'transparent',transition:'background 0.1s'}}
                      >
                        {/* Client */}
                        <td style={{padding:'10px 12px',color:'var(--text-0)',fontWeight:isConc?600:400}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            {bk>=4&&<span style={{fontSize:12}}>🔴</span>}
                            {bk===3&&<span style={{fontSize:12}}>⚠️</span>}
                            {isConc&&bk<3&&<span style={{fontSize:12}}>📌</span>}
                            <div>
                              <div style={{color:'var(--text-0)'}}>{c.name}</div>
                              <div style={{fontSize:9,color:'var(--text-3)',fontFamily:'monospace'}}>{c.account}</div>
                            </div>
                            {c.entries.length>0&&(
                              <span style={{marginLeft:'auto',fontSize:9,color:'var(--text-3)',background:'rgba(255,255,255,0.06)',padding:'1px 6px',borderRadius:10}}>
                                {c.entries.length} fact.
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Total */}
                        <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:700,fontSize:13,color:isConc?'var(--amber)':'var(--text-0)'}}>
                          <div>{fmt(c.total)} €</div>
                          <div style={{fontSize:9,color:'var(--text-3)'}}>{pctCli.toFixed(1)}% du total</div>
                        </td>
                        {/* Buckets */}
                        {c.buckets.map((v,bi)=>(
                          <td key={bi} style={{padding:'10px 8px',textAlign:'right',fontFamily:'monospace',fontSize:11,color:v>0?COLORS[bi]:'var(--text-3)'}}>
                            {v>0?fmt(v):'—'}
                          </td>
                        ))}
                        {/* Date ancienne */}
                        <td style={{padding:'10px 8px',textAlign:'right',fontSize:10,color:'var(--text-2)',fontFamily:'monospace'}}>
                          {c.oldest||'—'}
                        </td>
                        {/* Badge risque */}
                        <td style={{padding:'10px 12px',textAlign:'center'}}>
                          <span style={{padding:'3px 9px',borderRadius:20,fontSize:10,fontWeight:700,background:`${COLORS[bk]}15`,color:COLORS[bk],border:`1px solid ${COLORS[bk]}30`}}>
                            {risk}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'rgba(255,255,255,0.025)',borderTop:'2px solid var(--border-1)'}}>
                    <td style={{padding:'9px 12px',fontWeight:800,color:'var(--text-0)',fontSize:12}}>TOTAL</td>
                    <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:13,color:'var(--amber)'}}>{fmt(totalCreances)} €</td>
                    {bucketTotals.map((v,i)=>(
                      <td key={i} style={{padding:'9px 8px',textAlign:'right',fontFamily:'monospace',fontWeight:700,fontSize:11,color:v>0?COLORS[i]:'var(--text-3)'}}>
                        {v>0?fmt(v):'—'}
                      </td>
                    ))}
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div style={{marginTop:10,fontSize:10,color:'var(--text-3)'}}>
          * Comptes 411xxx du Grand Livre FEC. DSO = créances ÷ CA moyen mensuel × 30.
          🔴 &gt;90j ou critique · ⚠️ 60–90j urgent · 📌 &gt;30% concentration
        </div>
      </div>

      {modal && <EcrituresModal {...modal} onClose={()=>setModal(null)}/>}
    </>
  )
}
