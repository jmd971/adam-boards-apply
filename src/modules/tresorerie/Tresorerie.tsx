import React, { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { fmt, fiscalIndex, mergeEntries } from '@/lib/calc'
import { ENC_CATS, DEC_CATS, catOf, vatRateForAccount } from '@/lib/tresoCats'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { KpiCard, EcrituresModal } from '@/components/ui'
import { BankAccountsPanel } from './BankAccountsPanel'
import { useBankAccounts } from './useBankAccounts'

const MS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

type AD = { vals:number[]; label:string; moves?: any[] }

// Décale un mois YYYY-MM de `shift` mois calendaires (négatif = passé).
function monthShift(m: string, shift: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + shift, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Tresorerie() {
  const RAW           = useAppStore(s => s.RAW)
  const filters       = useAppStore(s => s.filters)
  const manualEntries = useAppStore(s => s.manualEntries)
  const budData       = useAppStore(s => s.budData)
  const vatSettings   = useAppStore(s => s.vatSettings)
  const { selectedMs } = usePeriodFilter()

  const [view,     setView]     = useState<'realise'|'prev'>('realise')
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const [modal,    setModal]    = useState<{title:string;entries:any[];cumN:number;cumN1:number}|null>(null)
  const [params,   setParams]   = useState<Record<string,{delaiClient:number;delaiFourn:number;remb:number;soldeInitial:number}>>({})
  const { data: bank } = useBankAccounts()
  // Solde initial du forecast : la somme des comptes bancaires saisis prime sur la
  // valeur manuelle "Solde initial" (rétro-compat) → fallback à 0 si aucun des deux.
  const soldeInitialPerCo = (co: string) =>
    (bank?.sumByCompany?.[co] ?? params[co]?.soldeInitial ?? 0)
  const [secOpen,     setSecOpen]     = useState<{enc:boolean;dec:boolean}>({enc:true,dec:true})
  const [paramsOpen,  setParamsOpen]  = useState(true)
  const [prevRowOpen, setPrevRowOpen] = useState<Record<string,boolean>>({})
  const [showHelp,    setShowHelp]    = useState(false)
  const [dayMonth, setDayMonth] = useState<string>('')

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])
  const months = selectedMs

  const getP = (co: string) => params[co] ?? { delaiClient:45, delaiFourn:30, remb:0, soldeInitial:0 }

  // ── Données réalisées (cash réel) ──────────────────────────────────────
  // Source = mouvements de trésorerie reconstruits du FEC (cashN, classe 5, TTC), groupés
  // par catégorie (nature) → compte de contrepartie → écritures. « FEC prioritaire » : si la
  // société a un FEC, on ignore ses factures saisies (déjà reflétées dans le FEC) pour ne pas
  // double-compter ; sans FEC, on reconstruit le réalisé depuis les paiements des saisies.
  // Ancré sur l'exercice (months = selectedMs, borné à l'exercice par le filtre TopBar).
  const treso = useMemo(() => {
    if (!RAW || !months.length) return null
    const eB: Record<string,number[]> = {}, eA: Record<string,Record<string,AD>> = {}
    const dB: Record<string,number[]> = {}, dA: Record<string,Record<string,AD>> = {}
    const miOf = (m: string) => months.indexOf(m)

    const push = (enc: boolean, cat: string, acc: string, label: string, mi: number, amt: number, entry: any[]) => {
      const B = enc ? eB : dB, A = enc ? eA : dA
      if (!B[cat]) B[cat] = Array(months.length).fill(0)
      if (!A[cat]) A[cat] = {}
      if (!A[cat][acc]) A[cat][acc] = { vals: Array(months.length).fill(0), label, moves: [] }
      B[cat][mi] += amt
      A[cat][acc].vals[mi] += amt
      ;(A[cat][acc].moves as any[]).push(entry)
    }

    for (const co of selCo) {
      // Tous les mouvements de trésorerie (N + N-1 + N-2), filtrés ensuite par les mois
      // sélectionnés. On NE lit PAS uniquement cashN : selon l'exercice fiscal réglé, les
      // mois affichés peuvent être classés dans cash1/cash2 — il faut donc les inclure,
      // le filtre `miOf(...) < 0` ne retenant que les mois de la période.
      const c = (RAW.companies[co] as any) ?? {}
      const cash = [...(c.cashN ?? []), ...(c.cash1 ?? []), ...(c.cash2 ?? [])]
      if (cash.length > 0) {
        // FEC prioritaire : réalisé = mouvements de trésorerie réels (TTC)
        for (const cm of cash) {
          const mi = miOf((cm.date || '').slice(0, 7))
          if (mi < 0) continue
          const enc = cm.dir === 'enc'
          const entry = [cm.date, cm.label || cm.counterpart, enc ? 0 : cm.amount, enc ? cm.amount : 0, cm.piece || '', 0]
          push(enc, cm.category, cm.counterpart, cm.label || cm.counterpart, mi, cm.amount, entry)
        }
      } else {
        // Pas de FEC → réalisé reconstruit depuis les paiements des factures saisies (TTC)
        for (const me of manualEntries) {
          if (me.company_key !== co || me.source === 'echeance') continue
          const ttc = parseFloat(me.amount_ttc || me.amount_ht_saisie || me.amount_ht || '0') || 0
          if (ttc === 0) continue
          const acc = me.account_num || '658'
          const enc = me.category === 'Vente'
          const cat = (enc ? catOf(acc, ENC_CATS) : catOf(acc, DEC_CATS)) || (enc ? 'Encaissements clients' : 'Décaissements fournisseurs')
          const lbl = me.subcategory || acc
          const pays: { date: string; amt: number }[] = []
          if (me.payment_mode === 'echeancier' && (me.echeancier_data as any)?.dates?.length) {
            const ds: string[] = (me.echeancier_data as any).dates
            const amts: number[] | undefined = (me.echeancier_data as any).amounts
            const eq = ttc / ds.length
            ds.forEach((d, i) => pays.push({ date: d, amt: amts?.[i] ?? eq }))
          } else {
            pays.push({ date: me.payment_date || me.entry_date, amt: ttc })
          }
          for (const p of pays) {
            const mi = miOf((p.date || '').slice(0, 7))
            if (mi < 0) continue
            const entry = [p.date, me.label || lbl, enc ? 0 : p.amt, enc ? p.amt : 0, '', 0]
            push(enc, cat, acc, lbl, mi, p.amt, entry)
          }
        }
      }
    }

    const sumA = (a: number[]) => a.reduce((s, v) => s + v, 0)
    for (const c of Object.keys(eB)) { eB[c] = eB[c].map(v=>Math.round(v)); Object.values(eA[c]).forEach(a=>{a.vals=a.vals.map(v=>Math.round(v))}) }
    for (const c of Object.keys(dB)) { dB[c] = dB[c].map(v=>Math.round(v)); Object.values(dA[c]).forEach(a=>{a.vals=a.vals.map(v=>Math.round(v))}) }
    const encCats = Object.keys(eB).filter(c => sumA(eB[c]) !== 0).sort((a, b) => sumA(eB[b]) - sumA(eB[a]))
    const decCats = Object.keys(dB).filter(c => sumA(dB[c]) !== 0).sort((a, b) => sumA(dB[b]) - sumA(dB[a]))
    const tE = months.map((_:string,mi:number) => encCats.reduce((s,c)=>s+eB[c][mi],0))
    const tD = months.map((_:string,mi:number) => decCats.reduce((s,c)=>s+dB[c][mi],0))
    const fl = months.map((_:string,mi:number) => tE[mi]-tD[mi])
    let cum=0; const cu = fl.map((v:number)=>{cum+=v;return cum})
    return { eB, eA, dB, dA, encCats, decCats, tE, tD, fl, cu }
  }, [RAW, selCo.join(','), months.join(','), manualEntries])

  // ── Données prévisionnelles ────────────────────────────────────────────
  // Le prévisionnel démarre à la date de solde bancaire la PLUS ANCIENNE parmi les sociétés
  // sélectionnées (point de trésorerie connu d'où l'on projette). Fallback : mois courant
  // si aucun solde saisi → comportement historique préservé.
  const forecastMs = useMemo(() => {
    let startYM: string | null = null
    for (const a of (bank?.all ?? [])) {
      if (!selCo.includes(a.company_key)) continue
      const ym = (a.balance_date || '').slice(0, 7)
      if (ym && (!startYM || ym < startYM)) startYM = ym
    }
    const base = startYM
      ? new Date(parseInt(startYM.slice(0, 4)), parseInt(startYM.slice(5, 7)) - 1, 1)
      : new Date()
    const ms: string[] = []
    for (let i=0;i<12;i++) {
      const d=new Date(base.getFullYear(),base.getMonth()+i,1)
      ms.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }
    return ms
  }, [bank?.all, selCo.join(',')])

  const forecast = useMemo(() => {
    // Mois déjà présents dans le réalisé → ne pas les compter en double dans le prévisionnel
    const realisedMonthsSet = new Set(months)
    let cum = selCo.reduce((s, co) => s + soldeInitialPerCo(co), 0)
    return forecastMs.map((m,mi) => {
      let enc=0, dec=0
      for (const co of selCo) {
        const bd=(budData as any)[co]??{}, p=getP(co)
        const vat = vatSettings[co]
        const dC=Math.max(0,Math.round(p.delaiClient/30)), dF=Math.max(0,Math.round(p.delaiFourn/30))
        const fiC=fiscalIndex(monthShift(forecastMs[mi], -dC)), fiF=fiscalIndex(monthShift(forecastMs[mi], -dF))
        for (const [acc, bv] of Object.entries(bd)) {
          const b=(bv as any).b??[]; const t=(bv as any).t
          // Budget stocké en HT → converti en TTC (cash réel) selon le taux TVA de la catégorie.
          // Si société non assujettie / pas de taux → rate=0 → ttc=ht (comportement historique).
          const mult = 1 + vatRateForAccount(acc, vat) / 100
          if (t==='p') enc+=(b[fiC]||0)*mult
          if (t==='c') dec+=(b[fiF]||0)*mult
        }
        dec+=p.remb
      }
      // Saisies manuelles : échéanciers et paiements ponctuels tombant ce mois prévisionnel
      // Uniquement les mois qui ne sont PAS déjà dans le réalisé (évite le double comptage).
      if (!realisedMonthsSet.has(m)) {
        for (const me of manualEntries) {
          if (!selCo.includes(me.company_key)) continue
          // Cash flow réel = TTC (ce qu'on paie/reçoit). Fallback HT si pas de TTC saisi.
          const ht  = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
          const ttc = parseFloat(me.amount_ttc || '0') || ht
          if (ttc === 0) continue
          if (me.payment_mode === 'echeancier' && (me.echeancier_data as any)?.dates?.length) {
            const echDates: string[] = (me.echeancier_data as any).dates
            const echAmounts: number[] | undefined = (me.echeancier_data as any).amounts
            const equalPart = ttc / echDates.length
            for (let idx = 0; idx < echDates.length; idx++) {
              const d = echDates[idx]
              if (d.startsWith(m)) {
                const part = echAmounts?.[idx] ?? equalPart
                if (me.category === 'Vente') enc += part
                else dec += part
              }
            }
          } else if (me.payment_date?.startsWith(m)) {
            // Paiement ponctuel avec date de règlement dans ce mois — cash flow TTC
            if (me.category === 'Vente') enc += ttc
            else dec += ttc
          }
        }
      }
      enc=Math.round(enc); dec=Math.round(dec)
      const fl=enc-dec; cum+=fl
      return { month: MS[parseInt(m.slice(5))-1], enc, dec, fl, cum }
    })
  }, [selCo.join(','), budData, vatSettings, params, forecastMs, bank?.sumByCompany, manualEntries, months.join(',')])

  // ── Détail prévisionnel par ligne budgétaire (pour les lignes dépliables) ─
  const forecastDetail = useMemo(() => {
    const enc: Record<string, { label:string; vals:number[] }> = {}
    const dec: Record<string, { label:string; vals:number[] }> = {}
    const realisedMonthsSet = new Set(months)
    for (let mi = 0; mi < forecastMs.length; mi++) {
      const m = forecastMs[mi]
      for (const co of selCo) {
        const bd = (budData as any)[co] ?? {}, p = getP(co)
        const vat = vatSettings[co]
        const dC = Math.max(0, Math.round(p.delaiClient/30))
        const dF = Math.max(0, Math.round(p.delaiFourn/30))
        const fiC = fiscalIndex(monthShift(forecastMs[mi], -dC))
        const fiF = fiscalIndex(monthShift(forecastMs[mi], -dF))
        for (const [acc, bv] of Object.entries(bd)) {
          const b = (bv as any).b ?? [], t = (bv as any).t, l = (bv as any).l || acc
          // Budget HT → TTC (cash) selon le taux TVA de la catégorie (0 si non assujetti).
          const mult = 1 + vatRateForAccount(acc, vat) / 100
          if (t === 'p') {
            const v = Math.round((b[fiC] || 0) * mult)
            if (!enc[acc]) enc[acc] = { label: l, vals: Array(forecastMs.length).fill(0) }
            enc[acc].vals[mi] += v
          }
          if (t === 'c') {
            const v = Math.round((b[fiF] || 0) * mult)
            if (!dec[acc]) dec[acc] = { label: l, vals: Array(forecastMs.length).fill(0) }
            dec[acc].vals[mi] += v
          }
        }
        if (p.remb > 0) {
          const k = `__remb_${co}`
          if (!dec[k]) dec[k] = { label: `Remboursement — ${RAW?.companies[co]?.name||co}`, vals: Array(forecastMs.length).fill(0) }
          dec[k].vals[mi] += Math.round(p.remb)
        }
      }
      // Saisies manuelles (échéanciers + paiements ponctuels) : même filtre que les totaux
      // → uniquement les mois hors réalisé, pour éviter le double comptage.
      if (!realisedMonthsSet.has(m)) {
        for (const me of manualEntries) {
          if (!selCo.includes(me.company_key)) continue
          // Cash flow réel = TTC (ce qu'on paie/reçoit). Fallback HT si pas de TTC saisi.
          const ht  = parseFloat(me.amount_ht_saisie || me.amount_ht || '0') || 0
          const ttc = parseFloat(me.amount_ttc || '0') || ht
          if (ttc === 0) continue
          const key = me.account_num || '658'
          const label = me.subcategory || key
          if (me.payment_mode === 'echeancier' && (me.echeancier_data as any)?.dates?.length) {
            const echDates: string[] = (me.echeancier_data as any).dates
            const echAmounts: number[] | undefined = (me.echeancier_data as any).amounts
            const equalPart = ttc / echDates.length
            for (let idx = 0; idx < echDates.length; idx++) {
              const d = echDates[idx]
              if (d.startsWith(m)) {
                const part = echAmounts?.[idx] ?? equalPart
                const bucket = me.category === 'Vente' ? enc : dec
                if (!bucket[key]) bucket[key] = { label, vals: Array(forecastMs.length).fill(0) }
                bucket[key].vals[mi] += part
              }
            }
          } else if (me.payment_date?.startsWith(m)) {
            const bucket = me.category === 'Vente' ? enc : dec
            if (!bucket[key]) bucket[key] = { label, vals: Array(forecastMs.length).fill(0) }
            bucket[key].vals[mi] += ttc
          }
        }
      }
    }
    return { enc, dec }
  }, [selCo.join(','), budData, vatSettings, params, forecastMs, bank?.sumByCompany, manualEntries, months.join(',')])

  // ── Vue journalière ────────────────────────────────────────────────────
  const dayForecast = useMemo(() => {
    if (!dayMonth) return []
    const mi = forecastMs.indexOf(dayMonth)
    if (mi < 0) return []
    const mData = forecast[mi]
    if (!mData) return []
    const [yr, mo] = dayMonth.split('-').map(Number)
    const daysInMonth = new Date(yr, mo, 0).getDate()
    const workDays: Date[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(yr, mo - 1, d)
      if (dt.getDay() !== 0 && dt.getDay() !== 6) workDays.push(dt)
    }
    if (!workDays.length) return []
    const encPerDay = mData.enc / workDays.length
    const decPerDay = mData.dec / workDays.length
    const startCum = mi > 0 ? forecast[mi-1].cum : selCo.reduce((s,co)=>s+soldeInitialPerCo(co),0)
    let cum = startCum
    return workDays.map(dt => {
      const enc = Math.round(encPerDay)
      const dec = Math.round(decPerDay)
      const fl = enc - dec
      cum += fl
      return { date: dt.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'}), enc, dec, fl, cum }
    })
  }, [dayMonth, forecast, forecastMs, selCo.join(','), params, bank?.sumByCompany])

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
          // Détail = les mouvements de trésorerie (cash réel) rattachés à ce compte/facture.
          // Fallback mergeEntries (pn) pour les sociétés sans FEC dont le réalisé vient des saisies.
          const ents=(a.moves && a.moves.length) ? a.moves : mergeEntries(RAW!,selCo,'pn',acc)
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

  const Sec = ({label,color,onToggle,isOpen}:{label:string;color:string;onToggle?:()=>void;isOpen?:boolean}) => (
    <tr style={{background:`${color}10`,cursor:onToggle?'pointer':'default'}} onClick={onToggle}>
      <td colSpan={months.length+2} style={{padding:'10px 12px',fontWeight:800,fontSize:11,color,letterSpacing:'1px',textTransform:'uppercase',borderTop:`2px solid ${color}40`,borderBottom:`1px solid ${color}20`,position:'sticky',left:0,userSelect:'none'}}>
        {onToggle&&<span style={{display:'inline-block',width:14,marginRight:4,fontSize:10}}>{isOpen?'▾':'▸'}</span>}
        {label}
      </td>
    </tr>
  )

  const gE = treso?.tE.reduce((s:number,v:number)=>s+v,0)??0
  const gD = treso?.tD.reduce((s:number,v:number)=>s+v,0)??0

  const inputSt: React.CSSProperties = {background:'var(--bg-0)',border:'1px solid var(--border-1)',borderRadius:6,color:'var(--text-0)',padding:'4px 8px',fontSize:11,width:70,outline:'none',textAlign:'right',fontFamily:'monospace'}

  return (
    <>
      {/* Comptes bancaires — placé AU-DESSUS de la barre sticky des onglets
          pour éviter que le titre soit masqué quand la page défile. */}
      <div style={{padding:'16px 24px 0'}}>
        <BankAccountsPanel selCo={selCo} />
      </div>

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
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:paramsOpen?12:0,cursor:'pointer',userSelect:'none'}}
              onClick={()=>setParamsOpen(o=>!o)}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.8px',display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,color:'var(--text-3)'}}>{paramsOpen?'▾':'▸'}</span>
                ⚙️ Paramètres
              </div>
              {paramsOpen && (
                <button onClick={e=>{e.stopPropagation();setShowHelp(h=>!h)}} style={{fontSize:10,color:'var(--blue)',background:'none',border:'none',cursor:'pointer',padding:'2px 8px',borderRadius:4,display:'flex',alignItems:'center',gap:4}}>
                  {showHelp?'▾':'▸'} Comment ça marche ?
                </button>
              )}
            </div>
            {paramsOpen && (<>
              {showHelp && (
                <div style={{background:'rgba(59,130,246,0.06)',borderRadius:8,padding:'12px 14px',marginBottom:14,fontSize:11,color:'var(--text-2)',lineHeight:'1.7',border:'1px solid rgba(59,130,246,0.15)'}}>
                  <div><span style={{color:'var(--blue)',fontWeight:600}}>Délai client (j)</span> — Jours avant qu'un client règle ses factures. Ex : 45 j → les encaissements de jan. arrivent en fév. dans le prévisionnel.</div>
                  <div style={{marginTop:6}}><span style={{color:'var(--amber)',fontWeight:600}}>Délai fourn. (j)</span> — Jours avant de régler vos fournisseurs. Ex : 30 j → les achats de jan. sont décaissés en fév.</div>
                  <div style={{marginTop:6}}><span style={{color:'var(--red)',fontWeight:600}}>Remb./mois (€)</span> — Charge fixe mensuelle sortante (remboursement de prêt, crédit-bail…) déduite chaque mois.</div>
                  <div style={{marginTop:6}}><span style={{color:'var(--purple)',fontWeight:600}}>Solde initial (€)</span> — Solde bancaire de départ utilisé comme point de départ de la trésorerie cumulée.</div>
                </div>
              )}
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                {selCo.map(co=>(
                  <div key={co} style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:12,fontWeight:700,color:'var(--blue)'}}>{RAW.companies[co]?.name||co}</span>
                    {([['Délai client (j)','delaiClient'],['Délai fourn. (j)','delaiFourn'],['Remb./mois (€)','remb'],['Solde initial (€)','soldeInitial']] as [string,string][]).map(([lbl,key])=>(
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
            </>)}
          </div>

          {/* Table prévisionnel mensuel */}
          <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 380px)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)',marginBottom:20}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{background:'var(--bg-1)'}}>
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
                  const canExpand=key==='enc'||key==='dec'
                  const isOpen=canExpand&&!!prevRowOpen[key]
                  const detail=canExpand
                    ? Object.entries(key==='enc'?forecastDetail.enc:forecastDetail.dec)
                        .filter(([,a])=>a.vals.some((v:number)=>v!==0))
                        .sort(([,a],[,b])=>b.vals.reduce((s:number,v:number)=>s+v,0)-a.vals.reduce((s:number,v:number)=>s+v,0))
                    : []
                  return (
                    <React.Fragment key={key}>
                      <tr onClick={canExpand?()=>setPrevRowOpen(p=>({...p,[key]:!p[key]})):undefined}
                        style={{borderBottom:'1px solid var(--border-0)',background:bold?'rgba(255,255,255,0.015)':isOpen?'rgba(255,255,255,0.02)':'transparent',cursor:canExpand?'pointer':'default'}}>
                        <td style={{padding:'8px 12px',color:col,fontWeight:bold?700:400,fontSize:bold?12:11,borderLeft:bold?`3px solid ${col}`:'3px solid transparent'}}>
                          {canExpand&&<span style={{display:'inline-block',width:14,marginRight:4,fontSize:9,color:'var(--text-3)'}}>{isOpen?'▾':'▸'}</span>}
                          {lbl}
                        </td>
                        {vals.map((v:number,i:number)=><td key={i} style={{padding:'8px 6px',textAlign:'right',fontFamily:'monospace',fontWeight:bold?700:400,fontSize:bold?12:11,color:v<0?'var(--red)':v===0?'var(--text-3)':col}}>{v!==0?fmt(v):'—'}</td>)}
                        <td style={{padding:'8px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:tot<0?'var(--red)':col}}>{fmt(tot)}</td>
                      </tr>
                      {isOpen&&detail.length===0&&(
                        <tr><td colSpan={forecastMs.length+2} style={{padding:'8px 12px 8px 34px',fontSize:10,color:'var(--amber)',fontStyle:'italic'}}>
                          Pas de données budgétaires — configurez un budget dans l'onglet Budget.
                        </td></tr>
                      )}
                      {isOpen&&detail.map(([acc,a])=>{
                        const dTot=a.vals.reduce((s:number,v:number)=>s+v,0)
                        const ents=!acc.startsWith('__')?mergeEntries(RAW!,selCo,'pn',acc):[]
                        return (
                          <tr key={acc}
                            onClick={ents.length>0?()=>setModal({title:`${acc} — ${a.label}`,entries:ents,cumN:dTot,cumN1:0}):undefined}
                            style={{borderBottom:'1px solid rgba(255,255,255,0.02)',background:'rgba(0,0,0,0.15)',cursor:ents.length>0?'pointer':'default'}}>
                            <td style={{padding:'5px 12px 5px 34px',fontSize:10,color:'var(--text-2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:220}}>
                              {!acc.startsWith('__')&&<span style={{fontFamily:'monospace',color:'var(--text-3)',marginRight:6,fontSize:9}}>{acc}</span>}
                              {a.label}
                              {ents.length>0&&<span style={{marginLeft:6,fontSize:9,color:'var(--text-3)',background:'rgba(255,255,255,0.06)',padding:'1px 5px',borderRadius:10}}>{ents.length} éc.</span>}
                            </td>
                            {a.vals.map((v:number,i:number)=>(
                              <td key={i} style={{padding:'5px 6px',textAlign:'right',fontFamily:'monospace',fontSize:10,color:v===0?'var(--text-3)':col}}>{v!==0?fmt(v):'—'}</td>
                            ))}
                            <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',fontSize:10,fontWeight:600,color:dTot<0?'var(--red)':col}}>{dTot!==0?fmt(dTot):'—'}</td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Vue journalière */}
          <div style={{background:'var(--bg-1)',borderRadius:'var(--radius-md)',padding:16,border:'1px solid var(--border-1)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.8px'}}>📅 Vue journalière</div>
              <select value={dayMonth} onChange={e=>setDayMonth(e.target.value)}
                style={{background:'var(--bg-0)',border:'1px solid var(--border-1)',borderRadius:6,color:'var(--text-0)',padding:'4px 10px',fontSize:11,outline:'none',cursor:'pointer'}}>
                <option value="">— Sélectionner un mois —</option>
                {forecastMs.map((m,i)=><option key={m} value={m}>{forecast[i]?.month} {m.slice(0,4)}</option>)}
              </select>
              {dayMonth&&<span style={{fontSize:10,color:'var(--text-3)'}}>Distribution uniforme sur jours ouvrés (Lun–Ven)</span>}
            </div>
            {dayMonth && dayForecast.length > 0 && (
              <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 480px)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-0)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr>
                      <th style={{...thSt,textAlign:'left',minWidth:140,paddingLeft:12}}>Date</th>
                      <th style={{...thSt,color:'var(--green)',minWidth:100}}>Encaissement</th>
                      <th style={{...thSt,color:'var(--red)',minWidth:100}}>Décaissement</th>
                      <th style={{...thSt,color:'var(--blue)',minWidth:90}}>Flux net</th>
                      <th style={{...thSt,color:'var(--purple)',minWidth:120}}>Trésorerie cumulée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayForecast.map((d,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--border-0)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                        <td style={{padding:'7px 12px',color:'var(--text-1)',fontWeight:500,textTransform:'capitalize'}}>{d.date}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',color:d.enc>0?'var(--green)':'var(--text-3)'}}>{d.enc>0?fmt(d.enc):'—'}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',color:d.dec>0?'var(--red)':'var(--text-3)'}}>{d.dec>0?fmt(d.dec):'—'}</td>
                        <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',color:d.fl<0?'var(--red)':d.fl>0?'var(--blue)':'var(--text-3)'}}>{d.fl!==0?fmt(d.fl):'—'}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:600,color:d.cum<0?'var(--red)':'var(--purple)'}}>{fmt(d.cum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dayMonth && dayForecast.length === 0 && (
              <div style={{fontSize:11,color:'var(--text-3)',textAlign:'center',padding:'16px 0'}}>Aucun jour ouvré trouvé pour ce mois.</div>
            )}
            {!dayMonth && (
              <div style={{fontSize:11,color:'var(--text-3)',textAlign:'center',padding:'8px 0'}}>Sélectionnez un mois pour afficher le détail journalier.</div>
            )}
          </div>
        </div>
      )}

      {/* VUE REALISEE */}
      {view==='realise' && (
        <div style={{padding:'16px 24px'}}>
          <div className="treso-kpi-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20}}>
            <KpiCard label="Encaissements N"     value={`${fmt(gE)} €`}      color="var(--green)"/>
            <KpiCard label="Décaissements N"     value={`${fmt(gD)} €`}      color="var(--red)"/>
            <KpiCard label="Flux net"             value={`${fmt(gE-gD)} €`}  color={(gE-gD)>=0?'var(--green)':'var(--red)'}/>
            <KpiCard label="Cumul fin période"   value={`${fmt(treso?.cu[treso.cu.length-1]??0)} €`} color="var(--purple)"/>
          </div>
          <div style={{marginBottom:10,fontSize:11,color:'var(--text-3)'}}>💡 Cliquez <span style={{color:'var(--blue)'}}>▸</span> sur une catégorie pour voir les comptes, puis sur un compte pour voir les écritures.</div>
          {treso && (
            <div className="treso-table-wrap" style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 260px)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border-1)'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{...thSt,textAlign:'left',minWidth:220,paddingLeft:12,position:'sticky',left:0,zIndex:7,background:'var(--bg-1)'}}>Poste</th>
                    {months.map((m:string)=><th key={m} style={{...thSt,minWidth:62}}>{MS[parseInt(m.slice(5))-1]}</th>)}
                    <th style={{...thSt,minWidth:85,color:'var(--blue)'}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <Sec label="📥 Encaissements" color="var(--green)" onToggle={()=>setSecOpen(s=>({...s,enc:!s.enc}))} isOpen={secOpen.enc}/>
                  {secOpen.enc&&treso.encCats.map(cat=><Cat key={cat} label={cat} vals={treso.eB[cat]} color="#34d399" accMap={treso.eA[cat]} k={`e_${cat}`}/>)}
                  {secOpen.enc&&treso.encCats.length===0&&(
                    <tr><td colSpan={99} style={{padding:'10px 24px',color:'var(--text-3)',fontSize:11,fontStyle:'italic'}}>Aucun encaissement sur la période.</td></tr>
                  )}
                  <Tot label="TOTAL ENCAISSEMENTS" vals={treso.tE} color="var(--green)" top/>
                  <Sec label="📤 Décaissements" color="var(--red)" onToggle={()=>setSecOpen(s=>({...s,dec:!s.dec}))} isOpen={secOpen.dec}/>
                  {secOpen.dec&&treso.decCats.map(cat=><Cat key={cat} label={cat} vals={treso.dB[cat]} color="#fca5a5" accMap={treso.dA[cat]} k={`d_${cat}`}/>)}
                  {secOpen.dec&&treso.decCats.length===0&&(
                    <tr><td colSpan={99} style={{padding:'10px 24px',color:'var(--text-3)',fontSize:11,fontStyle:'italic'}}>Aucun décaissement sur la période.</td></tr>
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

