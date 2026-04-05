import { useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { fmt, pct } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const CHARGE_COLORS = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#6366f1','#3b82f6','#14b8a6']

const CA_ACCS    = ['706','7061','70611','707','708','7080']
const ACHAT_ACCS = ['601','602','604','607']
const SERV_ACCS  = ['61','62']
const PERS_ACCS  = ['641','642','645','646']
const AMORT_ACCS = ['681']

function sumAccs(RAW: any, selCo: string[], field: 'pn'|'p1', month: string, prefixes: string[], charge = false) {
  let total = 0
  for (const co of selCo) {
    const data = RAW.companies[co]?.[field] ?? {}
    for (const [acc, acct] of Object.entries(data)) {
      if (!prefixes.some((p: string) => acc.startsWith(p))) continue
      const mo = (acct as any)?.mo?.[month]
      if (!mo || !Array.isArray(mo)) continue
      total += charge ? Math.max(0, mo[0] - mo[1]) : Math.max(0, mo[1] - mo[0])
    }
  }
  return Math.round(total)
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'10px 14px', fontSize:11 }}>
      <div style={{ fontWeight:700, color:'var(--text-1)', marginBottom:6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
          <span style={{ color:'var(--text-2)' }}>{p.name}</span>
          <span style={{ fontFamily:'monospace', fontWeight:600, color:p.color, marginLeft:'auto', paddingLeft:16 }}>{fmt(p.value)} €</span>
        </div>
      ))}
    </div>
  )
}

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px', fontSize:11 }}>
      <span style={{ color:'var(--text-2)' }}>{p.name} : </span>
      <span style={{ fontFamily:'monospace', fontWeight:700, color:p.payload.fill }}>{fmt(p.value)} €</span>
    </div>
  )
}

interface AlertItem { icon: string; title: string; msg: string; color: string; priority: 'high'|'medium'|'info' }

export function Dashboard() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const printRef = useRef<HTMLDivElement>(null)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // ── Export PDF ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    const style = document.createElement('style')
    style.id = '__print_style'
    style.innerHTML = `
      @media print {
        body > * { display: none !important; }
        #__dashboard_print { display: block !important; position: fixed; top: 0; left: 0; width: 100%; background: white; }
        #__dashboard_print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: A4 landscape; margin: 10mm; }
      }
    `
    document.head.appendChild(style)
    if (printRef.current) printRef.current.id = '__dashboard_print'
    window.print()
    setTimeout(() => {
      document.head.removeChild(style)
      if (printRef.current) printRef.current.removeAttribute('id')
    }, 1000)
  }

  // ── Données mensuelles ─────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!RAW?.mn?.length) return []
    return RAW.mn.map((m: string) => {
      const mN1  = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
      const caN  = sumAccs(RAW, selCo, 'pn', m, CA_ACCS)
      const caN1 = sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
      const ach  = sumAccs(RAW, selCo, 'pn', m, ACHAT_ACCS, true)
      const serv = sumAccs(RAW, selCo, 'pn', m, SERV_ACCS, true)
      const pers = sumAccs(RAW, selCo, 'pn', m, PERS_ACCS, true)
      const amrt = sumAccs(RAW, selCo, 'pn', m, AMORT_ACCS, true)
      const marge = caN - ach
      const ebe   = marge - serv - pers
      const re    = ebe - amrt
      return { month: MONTHS_SHORT[parseInt(m.slice(5))-1], m, 'CA N': caN, 'CA N-1': caN1, Marge: marge, EBE: ebe, Résultat: re }
    })
  }, [RAW, selCo.join(',')])

  // ── KPIs cumulés ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!RAW?.mn?.length) return null
    let ca=0, caN1=0, ach=0, serv=0, pers=0, amrt=0
    for (const m of RAW.mn) {
      const mN1 = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
      ca   += sumAccs(RAW, selCo, 'pn', m, CA_ACCS)
      caN1 += sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
      ach  += sumAccs(RAW, selCo, 'pn', m, ACHAT_ACCS, true)
      serv += sumAccs(RAW, selCo, 'pn', m, SERV_ACCS, true)
      pers += sumAccs(RAW, selCo, 'pn', m, PERS_ACCS, true)
      amrt += sumAccs(RAW, selCo, 'pn', m, AMORT_ACCS, true)
    }
    const marge = ca - ach
    const ebe   = marge - serv - pers
    const re    = ebe - amrt
    const evoCa = caN1 > 0 ? (ca - caN1) / caN1 : null
    return { ca, caN1, marge, ebe, re, evoCa,
      txMarge: ca > 0 ? marge/ca : 0,
      txEbe:   ca > 0 ? ebe/ca   : 0,
      txRe:    ca > 0 ? re/ca    : 0,
    }
  }, [RAW, selCo.join(',')])

  // ── Alertes du mois courant ────────────────────────────────────────────
  const alertes = useMemo((): AlertItem[] => {
    if (!RAW?.mn?.length || !kpis) return []
    const list: AlertItem[] = []
    const months = RAW.mn
    const lastM  = months[months.length - 1]
    const prevM  = months[months.length - 2]
    const lastLabel = MONTHS_SHORT[parseInt(lastM.slice(5))-1]

    // Données du mois courant
    const caLast  = sumAccs(RAW, selCo, 'pn', lastM, CA_ACCS)
    const achLast = sumAccs(RAW, selCo, 'pn', lastM, ACHAT_ACCS, true)
    const persLast = sumAccs(RAW, selCo, 'pn', lastM, PERS_ACCS, true)
    const servLast = sumAccs(RAW, selCo, 'pn', lastM, SERV_ACCS, true)
    const amrtLast = sumAccs(RAW, selCo, 'pn', lastM, AMORT_ACCS, true)
    const margeLast = caLast - achLast
    const ebeLast  = margeLast - servLast - persLast
    const reLast   = ebeLast - amrtLast

    // Données du mois précédent
    if (prevM) {
      const caPrev   = sumAccs(RAW, selCo, 'pn', prevM, CA_ACCS)
      const margePrev = caPrev - sumAccs(RAW, selCo, 'pn', prevM, ACHAT_ACCS, true)
      const ebePrev  = margePrev - sumAccs(RAW, selCo, 'pn', prevM, SERV_ACCS, true) - sumAccs(RAW, selCo, 'pn', prevM, PERS_ACCS, true)

      if (caPrev > 0) {
        const evoCa = (caLast - caPrev) / caPrev
        if (evoCa > 0.10) list.push({ icon:'🚀', priority:'info', title:`CA ${lastLabel} en forte hausse`, msg:`+${pct(evoCa)} vs mois précédent (${fmt(caLast)} €)`, color:'var(--green)' })
        else if (evoCa < -0.10) list.push({ icon:'📉', priority:'high', title:`CA ${lastLabel} en baisse`, msg:`${pct(evoCa)} vs mois précédent (${fmt(caLast)} € vs ${fmt(caPrev)} €)`, color:'var(--red)' })
      }
      if (ebePrev > 0 && ebeLast < ebePrev * 0.8) list.push({ icon:'⚠️', priority:'medium', title:`EBE en baisse en ${lastLabel}`, msg:`${fmt(ebeLast)} € vs ${fmt(ebePrev)} € le mois précédent (${pct((ebeLast-ebePrev)/ebePrev)})`, color:'var(--amber)' })
    }

    // Données N-1 même mois
    const mN1Last = `${parseInt(lastM.slice(0,4))-1}-${lastM.slice(5,7)}`
    const caLastN1 = sumAccs(RAW, selCo, 'p1', mN1Last, CA_ACCS)
    if (caLastN1 > 0) {
      const evoN1 = (caLast - caLastN1) / caLastN1
      if (evoN1 > 0.05) list.push({ icon:'📈', priority:'info', title:`CA ${lastLabel} au-dessus de N-1`, msg:`+${pct(evoN1)} vs même mois l'an passé (${fmt(caLastN1)} €)`, color:'var(--green)' })
      else if (evoN1 < -0.05) list.push({ icon:'⚠️', priority:'medium', title:`CA ${lastLabel} sous N-1`, msg:`${pct(evoN1)} vs même mois l'an passé (${fmt(caLastN1)} €)`, color:'var(--amber)' })
    }

    // Alertes structurelles annuelles
    if (kpis.re < 0) list.push({ icon:'🔴', priority:'high', title:'Résultat d\'exploitation négatif', msg:`Perte de ${fmt(Math.abs(kpis.re))} € sur la période`, color:'var(--red)' })
    if (kpis.txMarge < 0.15) list.push({ icon:'⚠️', priority:'high', title:'Taux de marge critique', msg:`${pct(kpis.txMarge)} du CA — seuil recommandé : 30%`, color:'var(--red)' })
    else if (kpis.txMarge < 0.25) list.push({ icon:'⚡', priority:'medium', title:'Taux de marge à surveiller', msg:`${pct(kpis.txMarge)} du CA — amélioration possible`, color:'var(--amber)' })
    if (kpis.txEbe < 0) list.push({ icon:'🔴', priority:'high', title:'EBE négatif', msg:'Les charges dépassent la valeur ajoutée', color:'var(--red)' })
    else if (kpis.txEbe < 0.05) list.push({ icon:'⚠️', priority:'medium', title:'EBE insuffisant', msg:`${pct(kpis.txEbe)} du CA — seuil critique : 5%`, color:'var(--amber)' })
    else if (kpis.txEbe > 0.15) list.push({ icon:'✅', priority:'info', title:'Excellente rentabilité', msg:`EBE à ${pct(kpis.txEbe)} du CA`, color:'var(--green)' })
    if (reLast < 0 && ebeLast >= 0) list.push({ icon:'💡', priority:'medium', title:`Amortissements élevés en ${lastLabel}`, msg:`L'EBE est positif (${fmt(ebeLast)} €) mais le RE est négatif après amortissements`, color:'var(--blue)' })

    // Trier: high > medium > info
    return list.sort((a, b) => { const o = {high:0, medium:1, info:2}; return o[a.priority] - o[b.priority] }).slice(0, 6)
  }, [RAW, selCo.join(','), kpis])

  // ── Répartition charges ────────────────────────────────────────────────
  const chargesData = useMemo(() => {
    if (!RAW?.mn?.length) return []
    const cats = [
      { name:'Achats',         prefixes:['60','601','607'],       color:CHARGE_COLORS[0] },
      { name:'Services ext.',  prefixes:['61','62'],              color:CHARGE_COLORS[1] },
      { name:'Impôts',         prefixes:['63'],                   color:CHARGE_COLORS[2] },
      { name:'Personnel',      prefixes:['641','642','645','646'],color:CHARGE_COLORS[3] },
      { name:'Amortissements', prefixes:['681'],                  color:CHARGE_COLORS[4] },
      { name:'Charges fin.',   prefixes:['66'],                   color:CHARGE_COLORS[5] },
      { name:'Autres',         prefixes:['65','67','68'],         color:CHARGE_COLORS[6] },
    ]
    return cats.map(cat => {
      let val = 0
      for (const m of RAW.mn) val += sumAccs(RAW, selCo, 'pn', m, cat.prefixes, true)
      return { name: cat.name, value: Math.round(val), fill: cat.color }
    }).filter(c => c.value > 0)
  }, [RAW, selCo.join(',')])

  const totalCharges = chargesData.reduce((s, c) => s + c.value, 0)
  const tickFmt = (v: number) => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)
  const lastMonthLabel = RAW?.mn?.length ? MONTHS_SHORT[parseInt(RAW.mn[RAW.mn.length-1].slice(5))-1] : ''

  if (!RAW) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:16, color:'var(--text-2)' }}>
      <div style={{ fontSize:40 }}>📊</div>
      <div style={{ fontSize:16, fontWeight:700, color:'var(--text-0)' }}>Bienvenue sur Adam Boards</div>
      <div style={{ fontSize:13 }}>Importez un fichier FEC pour voir votre tableau de bord</div>
      <button onClick={() => useAppStore.getState().setTab('import')}
        style={{ padding:'10px 24px', borderRadius:10, background:'linear-gradient(135deg,#3b82f6,#6366f1)', border:'none', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }}>
        → Aller à l'import
      </button>
    </div>
  )

  return (
    <div ref={printRef} style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header + bouton PDF */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:13, color:'var(--text-2)' }}>
            {selCo.map(co => RAW.companies[co]?.name || co).join(' · ')}
            {RAW.mn.length > 0 && ` · ${MONTHS_SHORT[parseInt(RAW.mn[0].slice(5))-1]} → ${lastMonthLabel} ${RAW.mn[RAW.mn.length-1].slice(0,4)}`}
          </div>
        </div>
        <button onClick={handlePrint}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:'var(--radius-md)', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border-1)', color:'var(--text-1)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          <span>📄</span> Exporter PDF
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:12 }}>
        <KpiCard label="Chiffre d'affaires" value={`${fmt(kpis?.ca ?? 0)} €`} color="var(--green)"
          trend={kpis?.evoCa != null ? kpis.evoCa * 100 : undefined}
          sub={kpis?.caN1 ? `N-1 : ${fmt(kpis.caN1)} €` : undefined} />
        <KpiCard label="Marge brute" value={`${fmt(kpis?.marge ?? 0)} €`} color="var(--blue)"
          sub={kpis ? `${pct(kpis.txMarge)} du CA` : undefined} />
        <KpiCard label="EBE" value={`${fmt(kpis?.ebe ?? 0)} €`}
          color={kpis && kpis.txEbe > 0.10 ? 'var(--green)' : kpis && kpis.txEbe > 0.05 ? 'var(--amber)' : 'var(--red)'}
          sub={kpis ? `${pct(kpis.txEbe)} du CA` : undefined} />
        <KpiCard label="Résultat exploit." value={`${fmt(kpis?.re ?? 0)} €`}
          color={kpis && kpis.re >= 0 ? 'var(--blue)' : 'var(--red)'}
          sub={kpis ? `${pct(kpis.txRe)} du CA` : undefined} />
      </div>

      {/* Alertes du mois */}
      {alertes.length > 0 && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'14px 16px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>
            🔔 Alertes — {lastMonthLabel}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:8 }}>
            {alertes.map((a, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 12px', borderRadius:'var(--radius-sm)', background:`${a.color}0d`, border:`1px solid ${a.color}25` }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{a.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:a.color, marginBottom:2 }}>{a.title}</div>
                  <div style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.5 }}>{a.msg}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CA mensuel */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
          📈 Évolution du CA — N vs N-1
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Line type="monotone" dataKey="CA N"   stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r:4 }} />
            <Line type="monotone" dataKey="CA N-1" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* EBE + Charges */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16 }}>
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
            📊 Marge · EBE · Résultat mensuels
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Bar dataKey="Marge"    fill="#3b82f6" opacity={0.75} radius={[3,3,0,0]} />
              <Bar dataKey="EBE"      fill="#f59e0b" opacity={0.85} radius={[3,3,0,0]} />
              <Bar dataKey="Résultat" fill="#10b981" opacity={0.9}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>
            🥧 Répartition des charges
          </div>
          {chargesData.length === 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:180, color:'var(--text-3)', fontSize:12 }}>Aucune charge</div>
          ) : (
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={chargesData} cx="50%" cy="50%" innerRadius={32} outerRadius={62}
                    dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                    {chargesData.map((_, i) => <Cell key={i} fill={chargesData[i].fill} opacity={0.85} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                {chargesData.map(cat => (
                  <div key={cat.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:cat.fill, flexShrink:0 }} />
                    <span style={{ color:'var(--text-2)', flex:1 }}>{cat.name}</span>
                    <span style={{ fontFamily:'monospace', color:'var(--text-1)', fontWeight:500 }}>
                      {totalCharges > 0 ? pct(cat.value / totalCharges) : '—'}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid var(--border-0)', fontSize:10, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text-3)' }}>Total</span>
                  <span style={{ fontFamily:'monospace', color:'var(--text-0)', fontWeight:700 }}>{fmt(totalCharges)} €</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Résultat mensuel */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
          🎯 Résultat d'exploitation mensuel
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
            <Bar dataKey="Résultat" radius={[3,3,0,0]}>
              {monthlyData.map((m: any, i: number) => (
                <Cell key={i} fill={m['Résultat'] >= 0 ? '#10b981' : '#ef4444'} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
