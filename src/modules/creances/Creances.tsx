import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { EcrituresModal } from '@/components/ui'

const TODAY = new Date()

const BUCKETS = [
  { label:'> 90 jours',  color:'#ef4444', bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.25)',  icon:'🔴', priority:0 },
  { label:'60 – 90 j',   color:'#f97316', bg:'rgba(249,115,22,0.07)', border:'rgba(249,115,22,0.2)',  icon:'⚠️', priority:1 },
  { label:'30 – 60 j',   color:'#f59e0b', bg:'rgba(245,158,11,0.07)', border:'rgba(245,158,11,0.2)',  icon:'📌', priority:2 },
  { label:'< 30 jours',  color:'#3b82f6', bg:'rgba(59,130,246,0.07)', border:'rgba(59,130,246,0.2)',  icon:'📋', priority:3 },
  { label:'Non échu',    color:'#22c55e', bg:'rgba(34,197,94,0.05)',   border:'rgba(34,197,94,0.15)',  icon:'✅', priority:4 },
]

function getBucket(dateStr: string): number {
  if (!dateStr) return 3
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 3
  const days = Math.round((TODAY.getTime() - d.getTime()) / 86400000)
  if (days > 90) return 0
  if (days > 60) return 1
  if (days > 30) return 2
  if (days >= 0) return 3
  return 4
}

interface ClientEntry {
  name:    string
  account: string
  total:   number
  entries: any[]
  oldest:  string
  bk:      number  // bucket dominant
}

export function Creances() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const [modal, setModal] = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)
  const [search, setSearch] = useState('')

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  const { byBucket, totalCreances, dso } = useMemo(() => {
    if (!RAW) return { byBucket: BUCKETS.map(()=>[]) as ClientEntry[][], totalCreances:0, dso:null }

    const map: Record<string, ClientEntry> = {}

    for (const co of selCo) {
      const bn = RAW.companies[co]?.bn ?? {}
      for (const [acc, acctData] of Object.entries(bn)) {
        // Comptes 41x = clients (411, 41A, 41B... format EBP/standard)
        if (!acc.startsWith('41') || acc.startsWith('419')) continue
        const data    = acctData as any
        const entries: any[] = data?.e ?? []
        const topArr:  any[] = data?.top ?? []
        const lbl = data?.l || acc

        if (entries.length > 0) {
          for (const e of entries) {
            const montant = Math.round(((e[3]||0) - (e[2]||0)) * 100) / 100
            if (montant <= 0) continue
            const dateStr = String(e[0] || '')
            const bk = getBucket(dateStr)
            // Clé = compte + nom client (pour éviter fusion entre clients différents)
            const key = acc
            if (!map[key]) map[key] = { name:lbl, account:acc, total:0, entries:[], oldest:'', bk:4 }
            map[key].total += montant
            map[key].entries.push(e)
            if (!map[key].oldest || dateStr < map[key].oldest) map[key].oldest = dateStr
            if (bk < map[key].bk) map[key].bk = bk  // bucket le plus urgent
          }
        } else if (topArr.length > 0) {
          for (const t of topArr) {
            const [cName,, montant] = t
            if ((montant||0) <= 0) continue
            const key = `${acc}__${cName}`
            if (!map[key]) map[key] = { name:String(cName), account:acc, total:0, entries:[], oldest:'', bk:3 }
            map[key].total += montant
          }
        } else if ((data?.s||0) > 0) {
          if (!map[acc]) map[acc] = { name:lbl, account:acc, total:0, entries:[], oldest:'', bk:3 }
          map[acc].total += data.s
          map[acc].buckets[3] = (map[acc] as any).buckets?.[3] ?? 0 + data.s
        }
      }
    }

    const allClients = Object.values(map)
      .filter(c => c.total > 0)
      .map(c => ({...c, total:Math.round(c.total)}))
      .sort((a,b) => b.total - a.total)

    // Grouper par bucket dominant
    const byBucket: ClientEntry[][] = BUCKETS.map(() => [])
    for (const c of allClients) byBucket[c.bk].push(c)

    const totalCreances = allClients.reduce((s,c)=>s+c.total,0)

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
    const caMensuel = RAW.mn?.length ? ca/RAW.mn.length : 0
    const dso = caMensuel > 0 ? Math.round(totalCreances/caMensuel*30) : null

    return { byBucket, totalCreances, dso }
  }, [RAW, selCo.join(',')])

  const filtered = useMemo(() => {
    if (!search.trim()) return byBucket
    const q = search.toLowerCase()
    return byBucket.map(bk => bk.filter(c => c.name.toLowerCase().includes(q) || c.account.toLowerCase().includes(q)))
  }, [byBucket, search])

  if (!RAW) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:256,color:'var(--text-2)',fontSize:13}}>Aucune donnée.</div>

  const totalBySec  = filtered.map(bk => bk.reduce((s,c)=>s+c.total,0))
  const nbClients   = filtered.flat().length
  const urgent90    = totalBySec[0] // >90j

  return (
    <>
      <div style={{padding:'20px 24px'}}>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Total créances</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:'var(--amber)'}}>{fmt(totalCreances)} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{nbClients} client{nbClients>1?'s':''}</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>DSO — Délai moyen</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:dso?(dso>60?'var(--red)':dso>30?'var(--amber)':'var(--green)'):'var(--text-2)'}}>
              {dso!==null?`${dso} j`:'—'}
            </div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>Objectif : &lt; 45 jours</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:`1px solid ${urgent90>0?'rgba(239,68,68,0.3)':'var(--border-1)'}`}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>🔴 &gt; 90 jours</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:urgent90>0?'var(--red)':'var(--green)'}}>{fmt(urgent90)} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{filtered[0].length} client{filtered[0].length>1?'s':''} — relance urgente</div>
          </div>
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-lg)',padding:'16px 18px',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>✅ Non échu</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',color:'var(--green)'}}>{fmt(totalBySec[4])} €</div>
            <div style={{fontSize:11,color:'var(--text-2)',marginTop:4}}>{filtered[4].length} client{filtered[4].length>1?'s':''} — dans les délais</div>
          </div>
        </div>

        {/* Barre résumé + recherche */}
        <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20,flexWrap:'wrap'}}>
          <div style={{display:'flex',height:16,borderRadius:4,overflow:'hidden',flex:1,minWidth:200,gap:1}}>
            {BUCKETS.map((bk,i) => {
              const p = totalCreances > 0 ? (totalBySec[i]/totalCreances)*100 : 0
              if (p < 0.5) return null
              return <div key={i} style={{width:`${p}%`,background:bk.color,opacity:0.8}} title={`${bk.label}: ${fmt(totalBySec[i])} €`}/>
            })}
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher un client..."
            style={{padding:'7px 12px',borderRadius:'var(--radius-sm)',background:'var(--bg-2)',border:'1px solid var(--border-1)',color:'var(--text-0)',fontSize:12,outline:'none',width:220}}/>
        </div>

        {/* Sections par ancienneté */}
        {filtered.every(bk=>bk.length===0) ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-3)',fontSize:12,background:'var(--bg-1)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)'}}>
            <div style={{fontSize:32,marginBottom:10}}>📋</div>
            {search ? `Aucun client ne correspond à "${search}"` : 'Aucun compte client (41x) avec solde positif dans le FEC.'}
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {BUCKETS.map((bk, bi) => {
              const clients = filtered[bi]
              if (!clients.length) return null
              const secTotal = totalBySec[bi]
              return (
                <div key={bi} style={{borderRadius:'var(--radius-lg)',border:`1px solid ${bk.border}`,overflow:'hidden'}}>

                  {/* En-tête section */}
                  <div style={{padding:'12px 16px',background:bk.bg,borderBottom:`1px solid ${bk.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:18}}>{bk.icon}</span>
                      <div>
                        <span style={{fontSize:13,fontWeight:800,color:bk.color}}>{bk.label}</span>
                        <span style={{marginLeft:10,fontSize:11,color:'var(--text-2)'}}>{clients.length} client{clients.length>1?'s':''}</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:18,fontWeight:800,fontFamily:'monospace',color:bk.color}}>{fmt(secTotal)} €</div>
                      <div style={{fontSize:10,color:'var(--text-3)'}}>{totalCreances>0?`${Math.round(secTotal/totalCreances*100)}% du total`:''}</div>
                    </div>
                  </div>

                  {/* Lignes clients */}
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'rgba(255,255,255,0.02)'}}>
                        <th style={{padding:'7px 16px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>Client</th>
                        <th style={{padding:'7px 12px',textAlign:'right',fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(255,255,255,0.04)',width:120}}>Montant dû</th>
                        <th style={{padding:'7px 12px',textAlign:'right',fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(255,255,255,0.04)',width:80}}>% Total</th>
                        <th style={{padding:'7px 12px',textAlign:'right',fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(255,255,255,0.04)',width:100}}>Facture +anc.</th>
                        <th style={{padding:'7px 16px',textAlign:'center',fontSize:10,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(255,255,255,0.04)',width:80}}>Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.sort((a,b)=>b.total-a.total).map((c, ci) => {
                        const pct = totalCreances > 0 ? (c.total/totalCreances)*100 : 0
                        return (
                          <tr key={ci}
                            style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:ci%2===1?'rgba(255,255,255,0.01)':'transparent'}}
                          >
                            <td style={{padding:'11px 16px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <div style={{width:8,height:8,borderRadius:'50%',background:bk.color,flexShrink:0,opacity:0.7}}/>
                                <div>
                                  <div style={{fontSize:13,fontWeight:600,color:'var(--text-0)'}}>{c.name}</div>
                                  <div style={{fontSize:10,color:'var(--text-3)',fontFamily:'monospace'}}>{c.account}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{padding:'11px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:700,fontSize:14,color:bk.color}}>
                              {fmt(c.total)} €
                            </td>
                            <td style={{padding:'11px 12px',textAlign:'right'}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
                                <div style={{height:4,width:50,borderRadius:2,background:'rgba(255,255,255,0.06)',overflow:'hidden'}}>
                                  <div style={{height:'100%',background:bk.color,width:`${Math.min(100,pct)}%`,opacity:0.7}}/>
                                </div>
                                <span style={{fontSize:11,color:'var(--text-2)',minWidth:38,textAlign:'right'}}>{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{padding:'11px 12px',textAlign:'right',fontSize:11,fontFamily:'monospace',color:'var(--text-2)'}}>
                              {c.oldest || '—'}
                            </td>
                            <td style={{padding:'11px 16px',textAlign:'center'}}>
                              {c.entries.length > 0 ? (
                                <button
                                  onClick={()=>setModal({title:`${c.name} — Factures en cours`,entries:c.entries,cumN:c.total,cumN1:0})}
                                  style={{padding:'4px 12px',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',border:`1px solid ${bk.color}40`,background:`${bk.color}12`,color:bk.color}}>
                                  {c.entries.length} fact. →
                                </button>
                              ) : (
                                <span style={{fontSize:10,color:'var(--text-3)'}}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:'rgba(255,255,255,0.02)',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                        <td style={{padding:'8px 16px',fontWeight:700,color:'var(--text-2)',fontSize:11}}>Sous-total {bk.label}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:13,color:bk.color}}>{fmt(secTotal)} €</td>
                        <td colSpan={3}/>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        <div style={{marginTop:14,fontSize:10,color:'var(--text-3)'}}>
          * Comptes 41x du Grand Livre FEC. DSO = créances ÷ CA moyen mensuel × 30. Cliquez sur "X fact. →" pour voir le détail des factures.
        </div>
      </div>

      {modal && <EcrituresModal {...modal} onClose={()=>setModal(null)}/>}
    </>
  )
}
