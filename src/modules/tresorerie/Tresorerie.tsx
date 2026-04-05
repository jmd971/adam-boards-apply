import React, { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt, fiscalIndex, mergeEntries } from '@/lib/calc'
import { KpiCard, EcrituresModal } from '@/components/ui'

const MS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

const ENC_CATS = [
  { label:'Ventes prestations',     accs:['706','7061','70611'] },
  { label:'Ventes marchandises',    accs:['707','7072'] },
  { label:'Activités annexes',      accs:['708','7080'] },
  { label:'Subventions',            accs:['74'] },
  { label:'Produits financiers',    accs:['76'] },
  { label:'Produits exceptionnels', accs:['77'] },
  { label:'Autres produits',        accs:['70','71','72','73','75','78','79'] },
]
const DEC_CATS = [
  { label:'Achats marchandises',    accs:['607','6071','6087','6097'] },
  { label:'Achats mat. premières',  accs:['601','6031','6081','602','603'] },
  { label:'Sous-traitance',         accs:['604'] },
  { label:'Services extérieurs',    accs:['61','62'] },
  { label:'Impôts & taxes',         accs:['63'] },
  { label:'Salaires',               accs:['641','642','643','644'] },
  { label:'Charges sociales',       accs:['645','646','647'] },
  { label:'Amortissements',         accs:['681','682','686','687'] },
  { label:'Charges financières',    accs:['66'] },
  { label:'Charges except.',        accs:['67'] },
  { label:'Impôt bénéfices',        accs:['695','696','697','698','699'] },
  { label:'Autres charges',         accs:['60','65','68','69'] },
]

function catOf(acc: string, cats: { label:string; accs:string[] }[]): string|null {
  for (const c of cats) { if (c.accs.some(a => acc.startsWith(a))) return c.label }
  return null
}

type AD = { vals:number[]; label:string }

export function Tresorerie() {
  const RAW           = useAppStore(s => s.RAW)
  const filters       = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)
  const budData       = useAppStore(s => s.budData)

  const [view,     setView]     = useState<'realise'|'prev'>('realise')
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const [modal,    setModal]    = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)
  const [params,   setParams]   = useState<Record<string,{delaiClient:number;delaiFourn:number;remb:number}>>({})

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])
  const months = RAW?.mn ?? []

  const getP = (co: string) => params[co] ?? { delaiClient:45, delaiFourn:30, remb:0 }

  // ── Données réalisées ─────────────────────────────────────────────────
  const treso = useMemo(() => {
    if (!RAW || !months.length) return null
    const eB: Record<string,number[]> = {}, eA: Record<string,Record<string,AD>> = {}
    const dB: Record<string,number[]> = {}, dA: Record<string,Record<string,AD>> = {}
    const eM = Array(months.length).fill(0), dM = Array(months.length).fill(0)
    ENC_CATS.forEach(c => { eB[c.label]=Array(months.length).fill(0); eA[c.label]={} })
    DEC_CATS.forEach(c => { dB[c.label]=Array(months.length).fill(0); dA[c.label]={} })

    for (const co of selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      for (const [acc, acct] of Object.entries(pn)) {
        const mo  = (acct as any)?.mo ?? {}
        const lbl = (acct as any)?.l  ?? acc
        const ec  = catOf(acc, ENC_CATS)
        if (ec) {
          if (!eA[ec][acc]) eA[ec][acc] = { vals: Array(months.length).fill(0), label: lbl }
          months.forEach((m, mi) => {
            const v = mo[m]; if (!v || !Array.isArray(v)) return
            const net = Math.max(0, (v[1] as number) - (v[0] as number))
            eB[ec][mi] += net; eA[ec][acc].vals[mi] += net
          })
        }
        const dc = catOf(acc, DEC_CATS)
        if (dc) {
          if (!dA[dc][acc]) dA[dc][acc] = { vals: Array(months.length).fill(0), label: lbl }
          months.forEach((m, mi) => {
            const v = mo[m]; if (!v || !Array.isArray(v)) return
            const net = Math.max(0, (v[0] as number) - (v[1] as number))
            dB[dc][mi] += net; dA[dc][acc].vals[mi] += net
          })
        }
      }
    }
    for (const me of manualEntries) {
      if (!me.entry_date) continue
      const mi = months.findIndex((m: string) => me.entry_date.startsWith(m)); if (mi < 0) continue
      const ht = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
      if (me.category === 'Vente') eM[mi] += ht; else dM[mi] += ht
    }
    ENC_CATS.forEach(c => { eB[c.label]=eB[c.label].map(v=>Math.round(v)); Object.values(eA[c.label]).forEach(a=>{a.vals=a.vals.map(v=>Math.round(v))}) })
    DEC_CATS.forEach(c => { dB[c.label]=dB[c.label].map(v=>Math.round(v)); Object.values(dA[c.label]).forEach(a=>{a.vals=a.vals.map(v=>Math.round(v))}) })
    const tE = months.map((_:string,mi:number) => ENC_CATS.reduce((s,c)=>s+eB[c.label][mi],0)+eM[mi])
    const tD = months.map((_:string,mi:number) => DEC_CATS.reduce((s,c)=>s+dB[c.label][mi],0)+dM[mi])
    const fl = months.map((_:string,mi:number) => tE[mi]-tD[mi])
    let cum=0; const cu = fl.map((v:number)=>{cum+=v;return cum})
    return { eB, eA, dB, dA, eM, dM, tE, tD, fl, cu }
  }, [RAW, selCo.join(','), months.join(','), manualEntries.length])

  // ── Données prévisionnelles ────────────────────────────────────────────
  const forecastMs = useMemo(() => {
    const now=new Date(), ms: string[]=[]
    for (let i=0;i<12;i++) {
      const d=new Date(now.getFullYear(),now.getMonth()+i,1)
      ms.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }
    return ms
  }, [])

  const forecast = useMemo(() => {
    let cum=0
    return forecastMs.map((m,mi) => {
      let enc=0, dec=0
      for (const co of selCo) {
        const bd=(budData as any)[co]??{}, p=getP(co)
        const dC=Math.max(0,Math.round(p.delaiClient/30)), dF=Math.max(0,Math.round(p.delaiFourn/30))
        const fiC=fiscalIndex(forecastMs[Math.max(0,mi-dC)]), fiF=fiscalIndex(forecastMs[Math.max(0,mi-dF)])
        for (const bv of Object.values(bd)) {
          const b=(bv as any).b??[]; const t=(bv as any).t
          if (t==='p') enc+=b[fiC]||0
          if (t==='c') dec+=b[fiF]||0
        }
        dec+=p.remb
      }
      enc=Math.round(enc); dec=Math.round(dec)
      const fl=enc-dec; cum+=fl
      return { month: MS[parseInt(m.slice(5))-1], enc, dec, fl, cum }
    })
  }, [selCo.join(','), budData, params, forecastMs])

  if (!RAW) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:256,color:'var(--text-2)',fontSize:13}}>
      Aucune donnée. Importez un fichier FEC.
    </div>
  )

  const tabSt = (on: boolean): React.CSSProperties => ({
    flex:1, padding:'8px 16px', border:'none', cursor:'pointer', borderRadius:'var(--radius-sm)',
    fontSize:12, fontWeight:600,
    background: on ? 'rgba(59,130,246,0.18)' : 'transparent',
    color:      on ? '#93c5fd' : 'var(--text-2)',
    boxShadow:  on ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
  })

  const thSt: React.CSSProperties = { padding:'7px 6px', textAlign:'right', color:'var(--text-2)', fontWeight:600, fontSize:11, borderBottom:'2px solid var(--border-1)', background:'var(--bg-1)', position:'sticky', top:0, zIndex:5, whiteSpace:'nowrap' }

  // ── Rendu catégorie avec détail cliquable ─────────────────────────────
  const Cat = ({ label, vals, color, accMap, k }: { label:string; vals:number[]; color:string; accMap:Record<string,AD>; k:string }) => {
    const total   = vals.reduce((s:number,v:number)=>s+v,0)
    const isOpen  = !!expanded[k]
    const accList = Object.entries(accMap).filter(([,a])=>a.vals.some((v:number)=>v>0))
    if (total===0 && !accList.length) return null
    return (
      <React.Fragment>
        <tr onClick={()=>accList.length&&setExpanded(p=>({...p,[k]:!p[k]}))}
          style={{borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:accList.length?'pointer':'default',background:isOpen?'rgba(255,255,255,0.02)':'transparent'}}>
          <td style={{padding:'8px 12px 8px 24px',color,fontWeight:500,fontSize:11.5,whiteSpace:'nowrap',position:'sticky',left:0,background:'var(--bg-0)',zIndex:2}}>
            {accList.length>0 && <span style={{display:'inline-block',width:14,marginRight:4,fontSize:9,color:'var(--text-3)'}}>{isOpen?'▾':'▸'}</span>}
            {label}
          </td>
          {vals.map((v:number,i:number)=>(
            <td key={i} style={{padding:'8px 6px',textAlign:'right',fontFamily:'monospace',fontSize:11,color:v===0?'var(--text-3)':color}}>{v!==0?fmt(v):'—'}</td>
          ))}
          <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:11,fontWeight:600,color}}>{total!==0?fmt(total):'—'}</td>
        </tr>
        {isOpen && accList.sort(([,a],[,b])=>b.vals.reduce((s:number,v:number)=>s+v,0)-a.vals.reduce((s:number,v:number)=>s+v,0)).map(([acc,a])=>{
          const tot=a.vals.reduce((s:number,v:number)=>s+v,0)
          const ents=mergeEntries(RAW!,selCo,'pn',acc)
          return (
            <tr key={acc} onClick={()=>setModal({title:`${acc} — ${a.label}`,entries:ents,cumN:tot,cumN1:0})}
              style={{borderBottom:'1px solid rgba(255,255,255,0.02)',background:'rgba(0,0,0,0.15)',cursor:'pointer'}}>
              <td style={{padding:'5px 12px 5px 44px',fontSize:10,color:'var(--text-2)',whiteSpace:'nowrap',position:'sticky',left:0,background:'rgba(6,11,20,0.95)',zIndex:2}}>
                <span style={{color:'var(--blue)',marginRight:4,fontSize:9}}>▸</span>
                <span style={{fontFamily:'monospace',color:'var(--text-3)',marginRight:6}}>{acc}</span>
                <span>{a.label}</span>
                {ents.length>0&&<span style={{marginLeft:6,fontSize:9,color:'var(--text-3)',background:'rgba(255,255,255,0.06)',padding:'1px 5px',borderRadius:10}}>{ents.length} éc.</span>}
              </td>
              {a.vals.map((v:number,i:number)=>(
                <td key={i} style={{padding:'5px 6px',textAlign:'right',fontFamily:'monospace',fontSize:10,color:v===0?'var(--text-3)':'var(--text-2)'}}>{v!==0?fmt(v):'—'}</td>
              ))}
              <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',fontSize:10,color:'var(--text-2)',fontWeight:600}}>{fmt(tot)}</td>
            </tr>
          )
        })}
      </React.Fragment>
    )
  }

  const Tot = ({label,vals,color,top=false}:{label:string;vals:number[];color:string;top?:boolean}) => {
    const t=vals.reduce((s:number,v:number)=>s+v,0)
    return (
      <tr style={{background:'rgba(255,255,255,0.025)',borderTop:top?`2px solid ${color}30`:'1px solid rgba(255,255,255,0.06)'}}>
        <td style={{padding:'9px 12px',fontWeight:800,fontSize:12,color,position:'sticky',left:0,background:'#0d1424',zIndex:2}}>{label}</td>
        {vals.map((v:number,i:number)=>(
          <td key={i} style={{padding:'9px 6px',textAlign:'right',fontFamily:'monospace',fontWeight:700,fontSize:12,color:v<0?'var(--red)':v===0?'var(--text-3)':color}}>{v!==0?fmt(v):'—'}</td>
        ))}
        <td style={{padding:'9px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:12,color:t<0?'var(--red)':color}}>{fmt(t)}</td>
      </tr>
    )
  }

  const Sec = ({label,color}:{label:string;color:string}) => (
    <tr style={{background:`${color}10`}}>
      <td colSpan={months.length+2} style={{padding:'10px 12px',fontWeight:800,fontSize:11,color,letterSpacing:'1px',textTransform:'uppercase',borderTop:`2px solid ${color}40`,borderBottom:`1px solid ${color}20`,position:'sticky',left:0}}>{label}</td>
    </tr>
  )

  const gE = treso?.tE.reduce((s:number,v:number)=>s+v,0)??0
  const gD = treso?.tD.reduce((s:number,v:number)=>s+v,0)??0

  const inputSt: React.CSSProperties = {background:'var(--bg-0)',border:'1px solid var(--border-1)',borderRadius:6,color:'var(--text-0)',padding:'4px 8px',fontSize:11,width:70,outline:'none',textAlign:'right',fontFamily:'monospace'}

  return (
    <>
      {/* Toggle */}
      <div style={{display:'flex',gap:4,padding:'16px 24px 12px',background:'var(--bg-0)',position:'sticky',top:54,zIndex:9,borderBottom:'1px solid var(--border-0)'}}>
        <button onClick={()=>setView('realise')} style={tabSt(view==='realise')}>📊 Réalisé</button>
        <button onClick={()=>setView('prev')}    style={tabSt(view==='prev')}>🔮 Prévisionnel (12 mois)</button>
      </div>

      {/* VUE PREVISIONNELLE */}
      {view==='prev' && (
        <div style={{padding:'16px 24px'}}>
          {/* Params */}
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-md)',padding:16,border:'1px solid var(--border-1)',marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12}}>⚙️ Paramètres</div>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              {selCo.map(co=>(
                <div key={co} style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--blue)'}}>{RAW.companies[co]?.name||co}</span>
                  {([['Délai client (j)','delaiClient'],['Délai fourn. (j)','delaiFourn'],['Remb./mois (€)','remb']] as [string,string][]).map(([lbl,key])=>(
                    <div key={key} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                      <span style={{color:'var(--text-2)'}}>{lbl}</span>
                      <input type="number" value={(getP(co) as any)[key]}
                        onChange={e=>setParams(p=>({...p,[co]:{...getP(co),[key]:parseFloat(e.target.value)||0}}))}
                        style={inputSt}/>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {Object.keys(budData).length===0&&<div style={{marginTop:10,fontSize:11,color:'var(--amber)'}}>⚠️ Aucun budget — générez-en un dans l'onglet Budget.</div>}
          </div>
          {/* Table prévisionnel */}
          <div style={{overflowX:'auto',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{background:'var(--bg-1)',position:'sticky',top:0,zIndex:5}}>
                  <th style={{...thSt,textAlign:'left',minWidth:200,paddingLeft:12}}>Poste</th>
                  {forecast.map(r=><th key={r.month} style={{...thSt,minWidth:65}}>{r.month}</th>)}
                  <th style={{...thSt,color:'var(--blue)',minWidth:85}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {([['📥 Encaissements','enc','var(--green)'],['📤 Décaissements','dec','var(--red)'],['💰 Flux net','fl','var(--blue)'],['📊 Trésorerie cumulée','cum','var(--purple)']] as [string,string,string][]).map(([lbl,key,col])=>{
                  const vals=forecast.map(r=>(r as any)[key])
                  const tot=key==='cum'?forecast[forecast.length-1]?.cum??0:vals.reduce((s:number,v:number)=>s+v,0)
                  const bold=key==='fl'||key==='cum'
                  return (
                    <tr key={key} style={{borderBottom:'1px solid var(--border-0)',background:bold?'rgba(255,255,255,0.015)':'transparent'}}>
                      <td style={{padding:'8px 12px',color:col,fontWeight:bold?700:400,fontSize:bold?12:11,borderLeft:bold?`3px solid ${col}`:'3px solid transparent'}}>{lbl}</td>
                      {vals.map((v:number,i:number)=><td key={i} style={{padding:'8px 6px',textAlign:'right',fontFamily:'monospace',fontWeight:bold?700:400,fontSize:bold?12:11,color:v<0?'var(--red)':v===0?'var(--text-3)':col}}>{v!==0?fmt(v):'—'}</td>)}
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:tot<0?'var(--red)':col}}>{fmt(tot)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VUE REALISEE */}
      {view==='realise' && (
        <div style={{padding:'16px 24px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
            <KpiCard label="Encaissements N"     value={`${fmt(gE)} €`}      color="var(--green)"/>
            <KpiCard label="Décaissements N"     value={`${fmt(gD)} €`}      color="var(--red)"/>
            <KpiCard label="Flux net"             value={`${fmt(gE-gD)} €`}  color={(gE-gD)>=0?'var(--green)':'var(--red)'}/>
            <KpiCard label="Cumul fin période"   value={`${fmt(treso?.cu[treso.cu.length-1]??0)} €`} color="var(--purple)"/>
          </div>
          <div style={{marginBottom:10,fontSize:11,color:'var(--text-3)'}}>💡 Cliquez <span style={{color:'var(--blue)'}}>▸</span> sur une catégorie pour voir les comptes, puis sur un compte pour voir les écritures.</div>
          {treso && (
            <div style={{overflowX:'auto',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{...thSt,textAlign:'left',minWidth:220,paddingLeft:12,position:'sticky',left:0,zIndex:7,background:'var(--bg-1)'}}>Poste</th>
                    {months.map((m:string)=><th key={m} style={{...thSt,minWidth:62}}>{MS[parseInt(m.slice(5))-1]}</th>)}
                    <th style={{...thSt,minWidth:85,color:'var(--blue)'}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <Sec label="📥 Encaissements" color="var(--green)"/>
                  {ENC_CATS.map(c=><Cat key={c.label} label={c.label} vals={treso.eB[c.label]} color="#34d399" accMap={treso.eA[c.label]} k={`e_${c.label}`}/>)}
                  {treso.eM.some((v:number)=>v>0)&&(
                    <tr style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'8px 12px 8px 24px',color:'var(--purple)',fontSize:11,fontStyle:'italic',position:'sticky',left:0,background:'var(--bg-0)',zIndex:2}}>Saisies manuelles</td>
                      {treso.eM.map((v:number,i:number)=><td key={i} style={{padding:'8px 6px',textAlign:'right',fontFamily:'monospace',fontSize:11,color:v===0?'var(--text-3)':'var(--purple)'}}>{v!==0?fmt(v):'—'}</td>)}
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:11,fontWeight:600,color:'var(--purple)'}}>{fmt(treso.eM.reduce((s:number,v:number)=>s+v,0))}</td>
                    </tr>
                  )}
                  <Tot label="TOTAL ENCAISSEMENTS" vals={treso.tE} color="var(--green)" top/>
                  <Sec label="📤 Décaissements" color="var(--red)"/>
                  {DEC_CATS.map(c=><Cat key={c.label} label={c.label} vals={treso.dB[c.label]} color="#fca5a5" accMap={treso.dA[c.label]} k={`d_${c.label}`}/>)}
                  {treso.dM.some((v:number)=>v>0)&&(
                    <tr style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'8px 12px 8px 24px',color:'var(--purple)',fontSize:11,fontStyle:'italic',position:'sticky',left:0,background:'var(--bg-0)',zIndex:2}}>Saisies manuelles</td>
                      {treso.dM.map((v:number,i:number)=><td key={i} style={{padding:'8px 6px',textAlign:'right',fontFamily:'monospace',fontSize:11,color:v===0?'var(--text-3)':'var(--purple)'}}>{v!==0?fmt(v):'—'}</td>)}
                      <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontSize:11,fontWeight:600,color:'var(--purple)'}}>{fmt(treso.dM.reduce((s:number,v:number)=>s+v,0))}</td>
                    </tr>
                  )}
                  <Tot label="TOTAL DÉCAISSEMENTS" vals={treso.tD} color="var(--red)" top/>
                  <Sec label="💰 Flux de trésorerie" color="var(--blue)"/>
                  <Tot label="FLUX NET" vals={treso.fl} color="var(--blue)"/>
                  <tr style={{background:'rgba(168,85,247,0.06)',borderTop:'2px solid rgba(168,85,247,0.2)'}}>
                    <td style={{padding:'9px 12px',fontWeight:800,fontSize:12,color:'var(--purple)',position:'sticky',left:0,background:'rgba(10,15,26,0.97)',zIndex:2}}>CUMUL</td>
                    {treso.cu.map((v:number,i:number)=><td key={i} style={{padding:'9px 6px',textAlign:'right',fontFamily:'monospace',fontWeight:700,fontSize:12,color:v<0?'var(--red)':'var(--purple)'}}>{fmt(v)}</td>)}
                    <td style={{padding:'9px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:12,color:(treso.cu[treso.cu.length-1]??0)<0?'var(--red)':'var(--purple)'}}>{fmt(treso.cu[treso.cu.length-1]??0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal && <EcrituresModal {...modal} onClose={()=>setModal(null)}/>}
    </>
  )
}
