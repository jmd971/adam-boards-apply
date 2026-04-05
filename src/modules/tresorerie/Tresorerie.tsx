import React, { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt, pct, fiscalIndex } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// Catégories encaissements / décaissements
const ENC_CATS = [
  { label: 'Ventes prestations',     accs: ['706','7061','70611'] },
  { label: 'Ventes marchandises',    accs: ['707','7072'] },
  { label: 'Activités annexes',      accs: ['708','7080'] },
  { label: 'Subventions',            accs: ['74'] },
  { label: 'Produits financiers',    accs: ['76'] },
  { label: 'Produits exceptionnels', accs: ['77'] },
  { label: 'Autres produits',        accs: ['70','71','72','73','75','78','79'] },
]
const DEC_CATS = [
  { label: 'Achats marchandises',     accs: ['607','6071','6087','6097'] },
  { label: 'Achats mat. premières',   accs: ['601','6031','6081','602','603'] },
  { label: 'Sous-traitance',          accs: ['604'] },
  { label: 'Services extérieurs',     accs: ['61','62'] },
  { label: 'Impôts & taxes',          accs: ['63'] },
  { label: 'Salaires',                accs: ['641','642','643','644'] },
  { label: 'Charges sociales',        accs: ['645','646','647'] },
  { label: 'Amortissements',          accs: ['681','682','686','687'] },
  { label: 'Charges financières',     accs: ['66'] },
  { label: 'Charges exceptionnelles', accs: ['67'] },
  { label: 'Impôt bénéfices',         accs: ['695','696','697','698','699'] },
  { label: 'Autres charges',          accs: ['60','65','68','69'] },
]

function findCat(acc: string, cats: typeof ENC_CATS): string | null {
  for (const cat of cats) {
    if (cat.accs.some(a => acc.startsWith(a))) return cat.label
  }
  return null
}

type AccData  = { vals: number[]; label: string }
type CatMap   = Record<string, number[]>
type AccMap   = Record<string, Record<string, AccData>>

// ── Trésorerie réalisée ────────────────────────────────────────────────────
function useTresoData(RAW: any, selCo: string[], months: string[], manualEntries: any[]) {
  return useMemo(() => {
    if (!RAW || !months.length) return null
    const encByCat: CatMap = {}; const encByAcc: AccMap = {}
    const decByCat: CatMap = {}; const decByAcc: AccMap = {}
    const encManuel = Array(months.length).fill(0)
    const decManuel = Array(months.length).fill(0)
    ENC_CATS.forEach(c => { encByCat[c.label] = Array(months.length).fill(0); encByAcc[c.label] = {} })
    DEC_CATS.forEach(c => { decByCat[c.label] = Array(months.length).fill(0); decByAcc[c.label] = {} })

    for (const co of selCo) {
      const pn = RAW.companies[co]?.pn ?? {}
      for (const [acc, acctData] of Object.entries(pn)) {
        const moMap = (acctData as any)?.mo ?? {}
        const lbl   = (acctData as any)?.l ?? acc
        const encCat = findCat(acc, ENC_CATS)
        if (encCat) {
          if (!encByAcc[encCat][acc]) encByAcc[encCat][acc] = { vals: Array(months.length).fill(0), label: lbl }
          months.forEach((m, mi) => {
            const mo = moMap[m]; if (!mo || !Array.isArray(mo)) return
            const v = Math.max(0, (mo[1] as number) - (mo[0] as number))
            encByCat[encCat][mi] += v; encByAcc[encCat][acc].vals[mi] += v
          })
        }
        const decCat = findCat(acc, DEC_CATS)
        if (decCat) {
          if (!decByAcc[decCat][acc]) decByAcc[decCat][acc] = { vals: Array(months.length).fill(0), label: lbl }
          months.forEach((m, mi) => {
            const mo = moMap[m]; if (!mo || !Array.isArray(mo)) return
            const v = Math.max(0, (mo[0] as number) - (mo[1] as number))
            decByCat[decCat][mi] += v; decByAcc[decCat][acc].vals[mi] += v
          })
        }
      }
    }
    for (const me of manualEntries) {
      if (!me.entry_date) continue
      const mi = months.findIndex((m: string) => me.entry_date.startsWith(m)); if (mi < 0) continue
      const ht = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
      if (me.category === 'Vente') encManuel[mi] += ht; else decManuel[mi] += ht
    }
    ENC_CATS.forEach(c => { encByCat[c.label] = encByCat[c.label].map(v => Math.round(v)); Object.values(encByAcc[c.label]).forEach(a => { a.vals = a.vals.map(v => Math.round(v)) }) })
    DEC_CATS.forEach(c => { decByCat[c.label] = decByCat[c.label].map(v => Math.round(v)); Object.values(decByAcc[c.label]).forEach(a => { a.vals = a.vals.map(v => Math.round(v)) }) })
    const totalEnc = months.map((_: string, mi: number) => ENC_CATS.reduce((s, c) => s + encByCat[c.label][mi], 0) + encManuel[mi])
    const totalDec = months.map((_: string, mi: number) => DEC_CATS.reduce((s, c) => s + decByCat[c.label][mi], 0) + decManuel[mi])
    const flux = months.map((_: string, mi: number) => totalEnc[mi] - totalDec[mi])
    let cum = 0; const cumulArr = flux.map((v: number) => { cum += v; return cum })
    return { encByCat, encByAcc, decByCat, decByAcc, encManuel, decManuel, totalEnc, totalDec, flux, cumulArr }
  }, [RAW, selCo.join(','), months.join(','), manualEntries.length])
}

// ── Trésorerie prévisionnelle ──────────────────────────────────────────────
function TresoPrevisionnelle({ RAW, selCo, budData }: { RAW: any; selCo: string[]; budData: any }) {
  const [params, setParams] = useState<Record<string, { delaiClient: number; delaiFourn: number; remboursEmp: number }>>({})
  const getP = (co: string) => params[co] || { delaiClient: 45, delaiFourn: 30, remboursEmp: 0 }

  // Générer les 12 prochains mois
  const forecastMonths = useMemo(() => {
    const now = new Date(); const months: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }
    return months
  }, [])

  const forecast = useMemo(() => {
    let cumul = 0
    return forecastMonths.map((m, mi) => {
      let encaiss = 0, decaiss = 0
      for (const co of selCo) {
        const bd = (budData as any)[co] ?? {}
        const p  = getP(co)
        const decalC = Math.max(0, Math.round(p.delaiClient / 30))
        const decalF = Math.max(0, Math.round(p.delaiFourn  / 30))
        const mSrcC  = mi - decalC
        const mSrcF  = mi - decalF
        const fiC    = mSrcC >= 0 ? fiscalIndex(forecastMonths[mSrcC]) : -1
        const fiF    = mSrcF >= 0 ? fiscalIndex(forecastMonths[mSrcF]) : -1

        // Encaissements = budget CA décalé du délai client
        for (const [acc, bv] of Object.entries(bd)) {
          const bvt = bv as any
          if (!bvt.b) continue
          if (bvt.t !== 'p') continue // produits seulement
          const fi = fiC >= 0 ? fiC : fiscalIndex(m)
          encaiss += bvt.b[fi] || 0
        }
        // Décaissements = budget charges décalé du délai fournisseur
        for (const [acc, bv] of Object.entries(bd)) {
          const bvt = bv as any
          if (!bvt.b) continue
          if (bvt.t !== 'c') continue // charges seulement
          const fi = fiF >= 0 ? fiF : fiscalIndex(m)
          decaiss += bvt.b[fi] || 0
        }
        // Remboursement emprunt
        decaiss += p.remboursEmp
      }
      encaiss = Math.round(encaiss); decaiss = Math.round(decaiss)
      const flux = encaiss - decaiss; cumul += flux
      return { month: MONTHS_SHORT[parseInt(m.slice(5))-1], m, encaiss, decaiss, flux, cumul }
    })
  }, [selCo.join(','), budData, params, forecastMonths])

  const inputSt: React.CSSProperties = { background:'var(--bg-0)', border:'1px solid var(--border-1)', borderRadius:6, color:'var(--text-0)', padding:'4px 8px', fontSize:11, width:70, outline:'none', textAlign:'right', fontFamily:'monospace' }

  return (
    <div style={{ padding:'16px 24px' }}>

      {/* Paramètres */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-md)', padding:16, border:'1px solid var(--border-1)', marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:12 }}>⚙️ Paramètres</div>
        <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
          {selCo.map(co => (
            <div key={co} style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--blue)' }}>{RAW.companies[co]?.name || co}</span>
              {[
                { label:'Délai client (j)', key:'delaiClient' as const },
                { label:'Délai fourn. (j)', key:'delaiFourn'  as const },
                { label:'Remb. emprunt/mois (€)', key:'remboursEmp' as const },
              ].map(({ label, key }) => (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                  <span style={{ color:'var(--text-2)' }}>{label}</span>
                  <input type="number" value={getP(co)[key]}
                    onChange={e => setParams(p => ({ ...p, [co]: { ...getP(co), [key]: parseFloat(e.target.value)||0 } }))}
                    style={inputSt} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {Object.keys(budData).length === 0 && (
          <div style={{ marginTop:10, fontSize:11, color:'var(--amber)' }}>
            ⚠️ Aucun budget défini — les projections seront à 0. Générez un budget dans l'onglet Budget.
          </div>
        )}
      </div>

      {/* Tableau prévisionnel */}
      <div style={{ overflowX:'auto', borderRadius:'var(--radius-lg)', border:'1px solid var(--border-1)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead>
            <tr style={{ background:'var(--bg-1)', position:'sticky', top:0, zIndex:5 }}>
              {['Poste', ...forecast.map(r => r.month), 'Total'].map((h, i) => (
                <th key={i} style={{ padding:'8px 8px', textAlign: i===0 ? 'left':'right', color: i===0 ? 'var(--text-2)' : i===forecast.length+1 ? 'var(--blue)' : 'var(--text-2)', fontWeight:600, fontSize:10, borderBottom:'2px solid var(--border-1)', minWidth: i===0 ? 180:65, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label:'📥 Encaissements prévisionnels', key:'encaiss' as const, color:'var(--green)' },
              { label:'📤 Décaissements prévisionnels', key:'decaiss' as const, color:'var(--red)' },
              { label:'💰 Flux net',                    key:'flux'    as const, color:'var(--blue)' },
              { label:'📊 Trésorerie cumulée',          key:'cumul'   as const, color:'var(--purple)' },
            ].map(row => {
              const vals  = forecast.map(r => r[row.key])
              const total = row.key === 'cumul' ? forecast[forecast.length-1]?.cumul ?? 0 : vals.reduce((s,v)=>s+v,0)
              const bold  = row.key === 'flux' || row.key === 'cumul'
              return (
                <tr key={row.key} style={{ borderBottom:'1px solid var(--border-0)', background: row.key==='cumul' ? 'rgba(168,85,247,0.04)' : bold ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <td style={{ padding:'8px 12px', color:row.color, fontWeight: bold?700:400, fontSize: bold?12:11, borderLeft: bold?`3px solid ${row.color}`:'3px solid transparent' }}>{row.label}</td>
                  {vals.map((v,i) => (
                    <td key={i} style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', fontWeight: bold?700:400, fontSize: bold?12:11, color: v<0 ? 'var(--red)' : v===0 ? 'var(--text-3)' : row.color }}>
                      {v !== 0 ? fmt(v) : '—'}
                    </td>
                  ))}
                  <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color: total<0?'var(--red)':row.color }}>{fmt(total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop:10, fontSize:10, color:'var(--text-3)' }}>
        * Projection basée sur le budget. Délai client = décalage encaissement, délai fournisseur = décalage paiement.
      </div>
    </div>
  )
}

// ── Composant principal Trésorerie ─────────────────────────────────────────
export function Tresorerie() {
  const RAW           = useAppStore(s => s.RAW)
  const filters       = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)
  const budData       = useAppStore(s => s.budData)

  const [view,     setView]     = useState<'realise' | 'previsionnel'>('realise')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }))

  const selCo  = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])
  const months = RAW?.mn ?? []
  const treso  = useTresoData(RAW, selCo, months, manualEntries)

  if (!RAW) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'var(--text-2)', fontSize:13 }}>
      Aucune donnée. Importez un fichier FEC.
    </div>
  )

  // Toggle vue
  const tabSt = (active: boolean): React.CSSProperties => ({
    flex:1, padding:'8px 16px', border:'none', cursor:'pointer', borderRadius:'var(--radius-sm)', fontSize:12, fontWeight:600,
    background: active ? 'rgba(59,130,246,0.18)' : 'transparent',
    color:      active ? '#93c5fd' : 'var(--text-2)',
    boxShadow:  active ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
  })

  if (!treso || months.length === 0) {
    if (view === 'previsionnel') {
      return (
        <div style={{ padding:'0 0 0 0' }}>
          <div style={{ display:'flex', gap:4, padding:'16px 24px 0', marginBottom:0 }}>
            <button onClick={() => setView('realise')}      style={tabSt(false)}>📊 Réalisé</button>
            <button onClick={() => setView('previsionnel')} style={tabSt(true)}>🔮 Prévisionnel</button>
          </div>
          <TresoPrevisionnelle RAW={RAW} selCo={selCo} budData={budData} />
        </div>
      )
    }
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'var(--text-2)', fontSize:13 }}>Aucun mois N disponible.</div>
  }

  const { encByCat, encByAcc, decByCat, decByAcc, encManuel, decManuel, totalEnc, totalDec, flux, cumulArr } = treso
  const grandEnc  = totalEnc.reduce((s:number,v:number)=>s+v,0)
  const grandDec  = totalDec.reduce((s:number,v:number)=>s+v,0)
  const grandFlux = grandEnc - grandDec

  const thSt: React.CSSProperties = {
    padding:'7px 6px', textAlign:'right', color:'var(--text-2)', fontWeight:600, fontSize:11,
    borderBottom:'2px solid var(--border-1)', background:'var(--bg-1)',
    position:'sticky', top:0, zIndex:5, whiteSpace:'nowrap',
  }

  const renderCat = (catLabel: string, vals: number[], color: string, accMap: Record<string, AccData>, key: string) => {
    const total     = vals.reduce((s:number,v:number)=>s+v,0)
    const isOpen    = !!expanded[key]
    const accList   = Object.entries(accMap).filter(([,a]) => a.vals.some((v:number) => v > 0))
    const hasDetail = accList.length > 0
    if (total === 0 && !hasDetail) return null
    return (
      <React.Fragment key={key}>
        <tr onClick={() => hasDetail && toggle(key)}
          style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', cursor: hasDetail?'pointer':'default', background: isOpen?'rgba(255,255,255,0.02)':'transparent' }}>
          <td style={{ padding:'8px 12px 8px 24px', color, fontWeight:500, fontSize:11.5, whiteSpace:'nowrap', position:'sticky', left:0, background:'var(--bg-0)', zIndex:2 }}>
            {hasDetail && <span style={{ display:'inline-block', width:14, marginRight:4, fontSize:9, color:'var(--text-3)' }}>{isOpen?'▾':'▸'}</span>}
            {catLabel}
          </td>
          {vals.map((v:number, i:number) => (
            <td key={i} style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v===0?'var(--text-3)':color }}>{v!==0?fmt(v):'—'}</td>
          ))}
          <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color }}>{total!==0?fmt(total):'—'}</td>
        </tr>
        {isOpen && accList.sort(([,a],[,b]) => b.vals.reduce((s:number,v:number)=>s+v,0) - a.vals.reduce((s:number,v:number)=>s+v,0)).map(([acc, a]) => {
          const tot = a.vals.reduce((s:number,v:number)=>s+v,0)
          return (
            <tr key={acc} style={{ borderBottom:'1px solid rgba(255,255,255,0.02)', background:'rgba(0,0,0,0.15)' }}>
              <td style={{ padding:'5px 12px 5px 44px', fontSize:10, color:'var(--text-2)', whiteSpace:'nowrap', position:'sticky', left:0, background:'rgba(6,11,20,0.95)', zIndex:2 }}>
                <span style={{ fontFamily:'monospace', color:'var(--text-3)', marginRight:6 }}>{acc}</span>
                <span>{a.label}</span>
              </td>
              {a.vals.map((v:number, i:number) => (
                <td key={i} style={{ padding:'5px 6px', textAlign:'right', fontFamily:'monospace', fontSize:10, color: v===0?'var(--text-3)':'var(--text-2)' }}>{v!==0?fmt(v):'—'}</td>
              ))}
              <td style={{ padding:'5px 10px', textAlign:'right', fontFamily:'monospace', fontSize:10, color:'var(--text-2)', fontWeight:600 }}>{fmt(tot)}</td>
            </tr>
          )
        })}
      </React.Fragment>
    )
  }

  const TotalRow = ({ label, vals, color, border=false }: { label:string; vals:number[]; color:string; border?:boolean }) => {
    const total = vals.reduce((s:number,v:number)=>s+v,0)
    return (
      <tr style={{ background:'rgba(255,255,255,0.025)', borderTop: border?`2px solid ${color}30`:'1px solid rgba(255,255,255,0.06)' }}>
        <td style={{ padding:'9px 12px', fontWeight:800, fontSize:12, color, position:'sticky', left:0, background:'#0d1424', zIndex:2 }}>{label}</td>
        {vals.map((v:number,i:number) => (
          <td key={i} style={{ padding:'9px 6px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:12, color: v<0?'var(--red)':v===0?'var(--text-3)':color }}>{v!==0?fmt(v):'—'}</td>
        ))}
        <td style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:12, color: total<0?'var(--red)':color }}>{fmt(total)}</td>
      </tr>
    )
  }

  const SectionHeader = ({ label, color }: { label:string; color:string }) => (
    <tr style={{ background:`${color}10` }}>
      <td colSpan={months.length+2} style={{ padding:'10px 12px', fontWeight:800, fontSize:11, color, letterSpacing:'1px', textTransform:'uppercase', borderTop:`2px solid ${color}40`, borderBottom:`1px solid ${color}20`, position:'sticky', left:0 }}>{label}</td>
    </tr>
  )

  return (
    <div>
      {/* Toggle vue */}
      <div style={{ display:'flex', gap:4, padding:'16px 24px 12px', background:'var(--bg-0)', position:'sticky', top:54, zIndex:9, borderBottom:'1px solid var(--border-0)' }}>
        <button onClick={() => setView('realise')}      style={tabSt(view==='realise')}>📊 Réalisé</button>
        <button onClick={() => setView('previsionnel')} style={tabSt(view==='previsionnel')}>🔮 Prévisionnel (12 mois)</button>
      </div>

      {view === 'previsionnel' ? (
        <TresoPrevisionnelle RAW={RAW} selCo={selCo} budData={budData} />
      ) : (
        <div style={{ padding:'16px 24px' }}>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            <KpiCard label="Encaissements N"      value={`${fmt(grandEnc)} €`}  color="var(--green)" />
            <KpiCard label="Décaissements N"      value={`${fmt(grandDec)} €`}  color="var(--red)" />
            <KpiCard label="Flux net"              value={`${fmt(grandFlux)} €`} color={grandFlux>=0?'var(--green)':'var(--red)'} />
            <KpiCard label="Cumul fin de période" value={`${fmt(cumulArr[cumulArr.length-1]??0)} €`} color="var(--purple)" />
          </div>

          <div style={{ marginBottom:10, fontSize:11, color:'var(--text-3)' }}>
            💡 Cliquez sur une catégorie <span style={{ color:'var(--blue)' }}>▸</span> pour afficher le détail par compte.
          </div>

          <div style={{ overflowX:'auto', borderRadius:'var(--radius-lg)', border:'1px solid var(--border-1)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thSt, textAlign:'left', minWidth:220, paddingLeft:12, position:'sticky', left:0, zIndex:7, background:'var(--bg-1)' }}>Poste</th>
                  {months.map((m: string) => (
                    <th key={m} style={{ ...thSt, minWidth:62 }}>{MONTHS_SHORT[parseInt(m.slice(5))-1]}</th>
                  ))}
                  <th style={{ ...thSt, minWidth:85, color:'var(--blue)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <SectionHeader label="📥 Encaissements" color="var(--green)" />
                {ENC_CATS.map(cat => renderCat(cat.label, encByCat[cat.label], '#34d399', encByAcc[cat.label], `enc_${cat.label}`))}
                {encManuel.some((v: number) => v>0) && (
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'8px 12px 8px 24px', color:'var(--purple)', fontSize:11, fontStyle:'italic', position:'sticky', left:0, background:'var(--bg-0)', zIndex:2 }}>Saisies manuelles</td>
                    {encManuel.map((v: number,i: number) => <td key={i} style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v===0?'var(--text-3)':'var(--purple)' }}>{v!==0?fmt(v):'—'}</td>)}
                    <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color:'var(--purple)' }}>{fmt(encManuel.reduce((s: number,v: number)=>s+v,0))}</td>
                  </tr>
                )}
                <TotalRow label="TOTAL ENCAISSEMENTS" vals={totalEnc} color="var(--green)" border />

                <SectionHeader label="📤 Décaissements" color="var(--red)" />
                {DEC_CATS.map(cat => renderCat(cat.label, decByCat[cat.label], '#fca5a5', decByAcc[cat.label], `dec_${cat.label}`))}
                {decManuel.some((v: number) => v>0) && (
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'8px 12px 8px 24px', color:'var(--purple)', fontSize:11, fontStyle:'italic', position:'sticky', left:0, background:'var(--bg-0)', zIndex:2 }}>Saisies manuelles</td>
                    {decManuel.map((v: number,i: number) => <td key={i} style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', fontSize:11, color: v===0?'var(--text-3)':'var(--purple)' }}>{v!==0?fmt(v):'—'}</td>)}
                    <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:600, color:'var(--purple)' }}>{fmt(decManuel.reduce((s: number,v: number)=>s+v,0))}</td>
                  </tr>
                )}
                <TotalRow label="TOTAL DÉCAISSEMENTS" vals={totalDec} color="var(--red)" border />

                <SectionHeader label="💰 Flux de trésorerie" color="var(--blue)" />
                <TotalRow label="FLUX NET" vals={flux} color="var(--blue)" />
                <tr style={{ background:'rgba(168,85,247,0.06)', borderTop:'2px solid rgba(168,85,247,0.2)' }}>
                  <td style={{ padding:'9px 12px', fontWeight:800, fontSize:12, color:'var(--purple)', position:'sticky', left:0, background:'rgba(10,15,26,0.97)', zIndex:2 }}>CUMUL</td>
                  {cumulArr.map((v: number,i: number) => (
                    <td key={i} style={{ padding:'9px 6px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:12, color: v<0?'var(--red)':'var(--purple)' }}>{fmt(v)}</td>
                  ))}
                  <td style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:12, color:(cumulArr[cumulArr.length-1]??0)<0?'var(--red)':'var(--purple)' }}>
                    {fmt(cumulArr[cumulArr.length-1]??0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
