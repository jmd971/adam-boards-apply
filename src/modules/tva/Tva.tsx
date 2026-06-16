import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { fmt } from '@/lib/calc'
import { usePeriodFilter } from '@/hooks/usePeriodFilter'
import { vatRateForAccount } from '@/lib/tresoCats'
import { KpiCard } from '@/components/ui'

const MS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

/**
 * Module TVA — estimation de la TVA collectée / déductible / nette à payer.
 *
 * Important : le FEC importé ne contient pas les comptes 445x (TVA réelle).
 * La TVA est donc CALCULÉE à partir des montants HT du P&L × les taux paramétrés
 * par catégorie (Paramètres → TVA). C'est une ESTIMATION de pilotage, pas la
 * déclaration officielle. Affiché clairement dans l'en-tête.
 */
export function Tva() {
  const { RAW, filters, selectedMs, msSrc } = usePeriodFilter()
  const vatSettings = useAppStore(s => s.vatSettings)
  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // Sociétés assujetties parmi celles sélectionnées
  const vatCos = useMemo(
    () => selCo.filter(co => vatSettings[co]?.enabled),
    [selCo.join(','), JSON.stringify(vatSettings)]
  )

  // TVA collectée (produits 7x) et déductible (charges 6x) par mois sélectionné.
  const data = useMemo(() => {
    if (!RAW || vatCos.length === 0) return null
    const collectee = selectedMs.map(() => 0)
    const deductible = selectedMs.map(() => 0)
    // Détail par compte pour le tableau dépliable
    const detCol: Record<string, { label: string; vals: number[] }> = {}
    const detDed: Record<string, { label: string; vals: number[] }> = {}

    selectedMs.forEach((m, mi) => {
      const field = msSrc[mi] === 'p2' ? 'p2' : msSrc[mi] === 'p1' ? 'p1' : 'pn'
      for (const co of vatCos) {
        const vat = vatSettings[co]
        const pl = (RAW.companies[co] as any)?.[field] ?? {}
        for (const [acc, acct] of Object.entries(pl)) {
          const rate = vatRateForAccount(acc, vat)
          if (!rate) continue
          const mo = (acct as any)?.mo?.[m]
          if (!mo || !Array.isArray(mo)) continue
          const [d, c] = mo as [number, number]
          const isProduit = acc[0] === '7'
          const ht = isProduit ? Math.max(0, c - d) : Math.max(0, d - c)
          if (ht === 0) continue
          const tva = (ht * rate) / 100
          const lbl = (acct as any)?.l || acc
          if (isProduit) {
            collectee[mi] += tva
            const k = acc
            if (!detCol[k]) detCol[k] = { label: lbl, vals: selectedMs.map(() => 0) }
            detCol[k].vals[mi] += tva
          } else {
            deductible[mi] += tva
            const k = acc
            if (!detDed[k]) detDed[k] = { label: lbl, vals: selectedMs.map(() => 0) }
            detDed[k].vals[mi] += tva
          }
        }
      }
    })

    const nette = selectedMs.map((_, i) => collectee[i] - deductible[i])
    let cum = 0
    const cumul = nette.map(v => { cum += v; return cum })
    const round = (arr: number[]) => arr.map(v => Math.round(v))
    return {
      collectee: round(collectee),
      deductible: round(deductible),
      nette: round(nette),
      cumul: round(cumul),
      detCol: Object.entries(detCol).map(([acc, v]) => ({ acc, ...v, vals: round(v.vals) })).filter(r => r.vals.some(x => x !== 0)).sort((a, b) => b.vals.reduce((s, x) => s + x, 0) - a.vals.reduce((s, x) => s + x, 0)),
      detDed: Object.entries(detDed).map(([acc, v]) => ({ acc, ...v, vals: round(v.vals) })).filter(r => r.vals.some(x => x !== 0)).sort((a, b) => b.vals.reduce((s, x) => s + x, 0) - a.vals.reduce((s, x) => s + x, 0)),
    }
  }, [RAW, vatCos.join(','), selectedMs.join(','), msSrc.join(','), JSON.stringify(vatSettings)])

  if (!RAW) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256, color:'var(--text-2)', fontSize:13 }}>
      Aucune donnée. Importez un fichier FEC.
    </div>
  )
  if (vatCos.length === 0) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:300, gap:12, color:'var(--text-2)', fontSize:13, textAlign:'center', padding:24 }}>
      <div style={{ fontSize:36 }}>🧾</div>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--text-0)' }}>Société non assujettie à la TVA</div>
      <div style={{ maxWidth:420 }}>
        Activez la TVA et réglez les taux par catégorie dans <strong style={{ color:'var(--blue)' }}>Paramètres → TVA</strong> pour voir l'estimation de TVA collectée, déductible et nette.
      </div>
    </div>
  )

  const totCol = data!.collectee.reduce((s, v) => s + v, 0)
  const totDed = data!.deductible.reduce((s, v) => s + v, 0)
  const totNet = totCol - totDed

  const thSt: React.CSSProperties = { padding:'8px 6px', textAlign:'right', color:'var(--text-2)', fontWeight:600, fontSize:11, borderBottom:'2px solid var(--border-1)', background:'var(--bg-1)', whiteSpace:'nowrap' }
  const Row = ({ label, vals, color, bold, cumul }: { label:string; vals:number[]; color:string; bold?:boolean; cumul?:boolean }) => {
    const tot = cumul ? (vals[vals.length-1] ?? 0) : vals.reduce((s,v)=>s+v,0)
    return (
      <tr style={{ borderBottom:'1px solid var(--border-0)', background: bold ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
        <td style={{ padding:'8px 12px', color, fontWeight:bold?700:500, fontSize:bold?12:11.5, borderLeft:bold?`3px solid ${color}`:'3px solid transparent', whiteSpace:'nowrap' }}>{label}</td>
        {vals.map((v,i)=>(
          <td key={i} style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', fontSize:bold?12:11, fontWeight:bold?700:400, color: v<0?'var(--red)':v===0?'var(--text-3)':color }}>{v!==0?fmt(v):'—'}</td>
        ))}
        <td style={{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', fontSize:bold?12:11, fontWeight:800, color: tot<0?'var(--red)':color }}>{fmt(tot)}</td>
      </tr>
    )
  }

  return (
    <div style={{ padding:'16px 24px' }}>
      <div style={{ marginBottom:14 }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text-0)', margin:0 }}>TVA — estimation</h2>
        <div style={{ fontSize:11, color:'var(--text-2)', marginTop:4, lineHeight:1.6 }}>
          ⚠️ Estimation calculée à partir du chiffre d'affaires et des achats/charges × les taux paramétrés
          (Paramètres → TVA) — <strong>ce n'est pas la déclaration officielle</strong> (le FEC importé ne contient pas les comptes 445x).
          {vatCos.length < selCo.length && <> Sociétés assujetties affichées : {vatCos.join(', ')}.</>}
        </div>
      </div>

      <div className="treso-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        <KpiCard label="TVA collectée"  value={`${fmt(totCol)} €`} color="var(--green)" tooltip="TVA estimée sur vos ventes (comptes 7x × taux paramétré)." />
        <KpiCard label="TVA déductible" value={`${fmt(totDed)} €`} color="var(--amber)" tooltip="TVA estimée sur vos achats et charges (comptes 6x × taux paramétré)." />
        <KpiCard label="TVA nette à payer" value={`${fmt(totNet)} €`} color={totNet>=0?'var(--red)':'var(--green)'} tooltip="Collectée − déductible. Positif = à reverser à l'État ; négatif = crédit de TVA." />
      </div>

      <div style={{ overflowX:'auto', borderRadius:'var(--radius-lg)', border:'1px solid var(--border-1)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thSt, textAlign:'left', minWidth:200, paddingLeft:12 }}>Poste</th>
              {selectedMs.map(m=><th key={m} style={{ ...thSt, minWidth:62 }}>{MS[parseInt(m.slice(5))-1]} {m.slice(2,4)}</th>)}
              <th style={{ ...thSt, color:'var(--blue)', minWidth:85 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <Row label="📥 TVA collectée (ventes)" vals={data!.collectee} color="var(--green)" bold />
            {data!.detCol.map(r => <Row key={r.acc} label={`     ${r.acc} — ${r.label}`} vals={r.vals} color="#34d399" />)}
            <Row label="📤 TVA déductible (achats/charges)" vals={data!.deductible} color="var(--amber)" bold />
            {data!.detDed.map(r => <Row key={r.acc} label={`     ${r.acc} — ${r.label}`} vals={r.vals} color="#fbbf24" />)}
            <Row label="💰 TVA nette à payer" vals={data!.nette} color="var(--red)" bold />
            <Row label="📊 Cumul TVA nette" vals={data!.cumul} color="var(--purple)" bold cumul />
          </tbody>
        </table>
      </div>
    </div>
  )
}
