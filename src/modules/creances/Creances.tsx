import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { EcrituresModal } from '@/components/ui'

const TODAY = new Date()

const BUCKETS = [
  { label:'> 90 jours', color:'#ef4444', bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.25)',  icon:'🔴', days:'> 90 j' },
  { label:'60 – 90 j',  color:'#f97316', bg:'rgba(249,115,22,0.07)', border:'rgba(249,115,22,0.2)',  icon:'⚠️', days:'60–90 j' },
  { label:'30 – 60 j',  color:'#f59e0b', bg:'rgba(245,158,11,0.07)', border:'rgba(245,158,11,0.2)',  icon:'📌', days:'30–60 j' },
  { label:'< 30 jours', color:'#3b82f6', bg:'rgba(59,130,246,0.07)', border:'rgba(59,130,246,0.2)',  icon:'📋', days:'< 30 j' },
  { label:'Non échu',   color:'#22c55e', bg:'rgba(34,197,94,0.05)',   border:'rgba(34,197,94,0.15)',  icon:'✅', days:'non échu' },
]

function ageDays(dateStr: string): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  return Math.round((TODAY.getTime() - d.getTime()) / 86400000)
}

function getBucket(days: number): number {
  if (days > 90) return 0
  if (days > 60) return 1
  if (days > 30) return 2
  if (days >= 0) return 3
  return 4
}

interface ClientRow {
  name: string; account: string; total: number
  bk: number; entries: any[]; oldest: string; oldestDays: number
}

export function Creances() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const [modal,  setModal]  = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)
  const [search, setSearch] = useState('')

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const { byBucket, totalCreances, dso } = useMemo(() => {
    if (!RAW) return { byBucket: BUCKETS.map(()=>[]) as ClientRow[][], totalCreances:0, dso:null }

    const map: Record<string, ClientRow> = {}

    for (const co of selCo) {
      const bn = RAW.companies[co]?.bn ?? {}
      for (const [acc, acctData] of Object.entries(bn)) {
        // Comptes clients : 41x (standard 411xxx ou EBP 41A/41B/41C...)
        if (!acc.startsWith('41') || acc.startsWith('419')) continue
        const data    = acctData as any
        const lbl     = data?.l || acc
        const entries: any[] = data?.e ?? []
        const topArr:  any[] = data?.top ?? []

        if (entries.length > 0) {
          // Format avec écritures individuelles — chaque compte = 1 client
          // Calculer le solde réel = débit - crédit (factures - paiements)
          let soldeReel = 0
          let oldestUnpaid = ''
          const unpaidEntries: any[] = []

          for (const e of entries) {
            const debit  = e[2] || 0
            const credit = e[3] || 0
            soldeReel += debit - credit
          }

          // Si solde > 0 → client doit de l'argent
          if (Math.round(soldeReel) <= 0) continue

          // Entrées de débit (factures) comme référence pour l'ancienneté
          for (const e of entries) {
            const debit = e[2] || 0
            if (debit > 0) {
              const dateStr = String(e[0] || '')
              if (!oldestUnpaid || dateStr < oldestUnpaid) oldestUnpaid = dateStr
              unpaidEntries.push(e)
            }
          }

          const days = ageDays(oldestUnpaid)
          const bk   = getBucket(days)

          if (!map[acc]) map[acc] = { name:lbl, account:acc, total:0, bk:4, entries:[], oldest:'', oldestDays:0 }
          map[acc].total      = Math.round(soldeReel)
          map[acc].entries    = entries
          map[acc].oldest     = oldestUnpaid
          map[acc].oldestDays = days
          map[acc].bk         = bk

        } else if (topArr.length > 0) {
          // Format standard 411 avec CompAuxNum — 1 ligne par client auxiliaire
          for (const t of topArr) {
            const [cAux, cLbl, montant] = t
            if ((montant||0) <= 0) continue
            const key = `${acc}__${cAux}`
            if (!map[key]) map[key] = { name:String(cLbl||cAux), account:String(cAux), total:0, bk:3, entries:[], oldest:'', oldestDays:0 }
            map[key].total += Math.round(montant)
          }

        } else if ((data?.s||0) > 0) {
          // Fallback : compte avec solde mais sans entrées
          if (!map[acc]) map[acc] = { name:lbl, account:acc, total:0, bk:3, entries:[], oldest:'', oldestDays:0 }
          map[acc].total += Math.round(data.s)
        }
      }
    }

    const all = Object.values(map).filter(c => c.total > 0)
    const byBucket: ClientRow[][] = BUCKETS.map(() => [])
    for (const c of all) byBucket[c.bk].push(c)

    const totalCreances = all.reduce((s,c)=>s+c.total,0)

    // DSO
    let ca = 0
    if (RAW.mn?.length) {
      for (const m of RAW.mn) {
        for (const co of selCo) {
          const pn = RAW.companies[co]?.pn ?? {}
          for (const [acc, d] of Object.entries(pn)) {
            if (!['706','707','708'].some(p=>acc.startsWith(p))) continue
            const mo = (d as any)?.mo?.[m]
            if (mo && Array.isArray(mo)) ca += Math.max(0, mo[1]-mo[0])
          }
        }
      }
    }
    const dso = ca > 0 && RAW.mn?.length ? Math.round(totalCreances / (ca/RAW.mn.length) * 30) : null

    return { byBucket, totalCreances, dso }
  }, [RAW, selCo.join(',')])

  const filtered = useMemo(() => {
    if (!search.trim()) return byBucket
    const q = search.toLowerCase()
    return byBucket.map(bk => bk.filter(c =>
      c.name.toLowerCase().includes(q) || c.account.toLowerCase().includes(q)
    ))
  }, [byBucket, search])

  if (!RAW) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:256,color:'var(--text-2)',fontSize:13}}>Aucune donnée.</div>

  const secTotals = filtered.map(bk => bk.reduce((s,c)=>s+c.total,0))
  const nbTotal   = filtered.flat().length

  return (
    <>
      <div style={{padding:'20px 24px'}}>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Total créances</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:'var(--amber)'}}>{fmt(totalCreances)} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{nbTotal} client{nbTotal>1?'s':''} avec solde dû</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>DSO</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:dso?(dso>60?'var(--red)':dso>30?'var(--amber)':'var(--green)'):'var(--text-2)'}}>
              {dso!==null?`${dso} j`:'—'}
            </div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>Objectif : &lt; 45 jours</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:`1px solid ${secTotals[0]>0?'rgba(239,68,68,0.3)':'var(--border-1)'}`}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>🔴 &gt; 90 j — Critique</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:secTotals[0]>0?'var(--red)':'var(--green)'}}>{fmt(secTotals[0])} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{filtered[0].length} client{filtered[0].length>1?'s':''}</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>✅ Non échu</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:'var(--green)'}}>{fmt(secTotals[4])} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{filtered[4].length} client{filtered[4].length>1?'s':''}</div>
          </div>
        </div>

        {/* Barre + recherche */}
        <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
          <div style={{display:'flex',height:14,borderRadius:3,overflow:'hidden',flex:1,gap:1}}>
            {BUCKETS.map((bk,i)=>{
              const p = totalCreances>0?(secTotals[i]/totalCreances)*100:0
              if (p<0.5) return null
              return <div key={i} style={{width:`${p}%`,background:bk.color,opacity:0.85}} title={`${bk.label}: ${fmt(secTotals[i])} €`}/>
            })}
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher un client..."
            style={{padding:'7px 12px',borderRadius:'var(--radius-sm)',background:'var(--bg-2)',border:'1px solid var(--border-1)',color:'var(--text-0)',fontSize:12,outline:'none',width:220}}/>
        </div>

        {/* Note si données sans entrées */}
        {nbTotal > 0 && filtered.flat().every(c=>c.entries.length===0) && (
          <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'var(--radius-md)',padding:'10px 16px',marginBottom:16,fontSize:12,color:'var(--amber)'}}>
            ⚠️ Les noms de clients sont affichés mais sans écritures datées — réimportez le FEC pour obtenir le détail des factures et le calcul de l'ancienneté.
          </div>
        )}

        {/* Sections par ancienneté */}
        {filtered.every(bk=>bk.length===0) ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-3)',fontSize:12,background:'var(--bg-1)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:32,marginBottom:10}}>📋</div>
            {search?`Aucun résultat pour "${search}"`:'Aucune créance client détectée dans ce FEC.'}
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {BUCKETS.map((bk,bi)=>{
              const clients = [...filtered[bi]].sort((a,b)=>b.total-a.total)
              if (!clients.length) return null
              return (
                <div key={bi} style={{borderRadius:'var(--radius-lg)',border:`1px solid ${bk.border}`,overflow:'hidden'}}>

                  {/* En-tête section */}
                  <div style={{padding:'12px 18px',background:bk.bg,borderBottom:`1px solid ${bk.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:18}}>{bk.icon}</span>
                      <div>
                        <span style={{fontSize:14,fontWeight:800,color:bk.color}}>{bk.label}</span>
                        <span style={{marginLeft:10,fontSize:11,color:'var(--text-2)'}}>{clients.length} client{clients.length>1?'s':''}</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:20,fontWeight:800,fontFamily:'monospace',color:bk.color}}>{fmt(secTotals[bi])} €</div>
                      <div style={{fontSize:10,color:'var(--text-3)'}}>
                        {totalCreances>0?`${Math.round(secTotals[bi]/totalCreances*100)}% du total`:''}
                      </div>
                    </div>
                  </div>

                  {/* Tableau clients */}
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'rgba(255,255,255,0.015)'}}>
                        {['Client','Compte','Montant dû','% total','Fact. la + ancienne','Ancienneté','Factures'].map((h,i)=>(
                          <th key={h} style={{
                            padding:'7px '+(i===0||i===6?'18px':'10px'),
                            textAlign:i<=1?'left':'right',fontSize:10,fontWeight:600,
                            color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.4px',
                            borderBottom:'1px solid rgba(255,255,255,0.05)',
                            width:i===0?undefined:i===1?90:i===2?110:i===3?70:i===4?100:i===5?90:80,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((c,ci)=>{
                        const pct = totalCreances>0?(c.total/totalCreances)*100:0
                        return (
                          <tr key={ci} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:ci%2===0?'transparent':'rgba(255,255,255,0.008)'}}>
                            <td style={{padding:'11px 18px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <div style={{width:8,height:8,borderRadius:'50%',background:bk.color,flexShrink:0,opacity:0.8}}/>
                                <span style={{fontSize:13,fontWeight:600,color:'var(--text-0)'}}>{c.name}</span>
                              </div>
                            </td>
                            <td style={{padding:'11px 10px',fontFamily:'monospace',fontSize:10,color:'var(--text-3)'}}>{c.account}</td>
                            <td style={{padding:'11px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:15,color:bk.color}}>{fmt(c.total)} €</td>
                            <td style={{padding:'11px 10px',textAlign:'right'}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:5}}>
                                <div style={{height:4,width:44,borderRadius:2,background:'rgba(255,255,255,0.06)',overflow:'hidden'}}>
                                  <div style={{height:'100%',background:bk.color,width:`${Math.min(100,pct)}%`,opacity:0.75}}/>
                                </div>
                                <span style={{fontSize:11,color:'var(--text-2)',minWidth:36,textAlign:'right'}}>{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{padding:'11px 10px',textAlign:'right',fontSize:11,fontFamily:'monospace',color:'var(--text-2)'}}>
                              {c.oldest||'—'}
                            </td>
                            <td style={{padding:'11px 10px',textAlign:'right'}}>
                              {c.oldestDays>0?(
                                <span style={{fontSize:12,fontWeight:700,color:bk.color}}>{c.oldestDays} j</span>
                              ):'—'}
                            </td>
                            <td style={{padding:'11px 18px',textAlign:'center'}}>
                              {c.entries.length>0?(
                                <button onClick={()=>setModal({title:`${c.name} — Factures`,entries:c.entries,cumN:c.total,cumN1:0})}
                                  style={{padding:'4px 12px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',border:`1px solid ${bk.color}40`,background:`${bk.color}15`,color:bk.color}}>
                                  {c.entries.length} éc. →
                                </button>
                              ):(
                                <span style={{fontSize:10,color:'var(--text-3)'}}>Réimporter</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.015)'}}>
                        <td style={{padding:'8px 18px',fontWeight:700,color:'var(--text-2)',fontSize:11}} colSpan={2}>Sous-total {bk.label}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:13,color:bk.color}}>{fmt(secTotals[bi])} €</td>
                        <td colSpan={4}/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })}
          </div>
        )}
        <div style={{marginTop:14,fontSize:10,color:'var(--text-3)'}}>
          * Comptes 41x (FEC). Solde = factures − paiements. Ancienneté = jours depuis la facture la plus ancienne non réglée. Cliquez "X éc." pour le détail.
        </div>
      </div>
      {modal && <EcrituresModal {...modal} onClose={()=>setModal(null)}/>}
    </>
  )
}
