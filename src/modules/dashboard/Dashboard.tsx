import { useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { fmt, pct, monthIdx } from '@/lib/calc'
import { KpiCard } from '@/components/ui'

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const CHARGE_COLORS = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#6366f1','#3b82f6','#14b8a6']

const CA_ACCS    = ['706','7061','70611','707','708','7080']
const ACHAT_ACCS = ['601','602','604','607']
const SERV_ACCS  = ['61','62']
const PERS_ACCS  = ['641','642','645','646']
const AMORT_ACCS = ['681']

function sumAccs(RAW: any, selCo: string[], field: 'pn'|'p1', month: string, prefixes: string[], charge = false): number {
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

function computeKpis(RAW: any, selCo: string[], months: string[]) {
  let ca=0, caN1=0, ach=0, serv=0, pers=0, amrt=0
  for (const m of months) {
    const mN1 = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
    ca   += sumAccs(RAW, selCo, 'pn', m, CA_ACCS)
    caN1 += sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
    ach  += sumAccs(RAW, selCo, 'pn', m, ACHAT_ACCS, true)
    serv += sumAccs(RAW, selCo, 'pn', m, SERV_ACCS,  true)
    pers += sumAccs(RAW, selCo, 'pn', m, PERS_ACCS,  true)
    amrt += sumAccs(RAW, selCo, 'pn', m, AMORT_ACCS, true)
  }
  const marge = ca - ach
  const ebe   = marge - serv - pers
  const re    = ebe - amrt
  return { ca, caN1, ach, serv, pers, amrt, marge, ebe, re,
    evoCa:   caN1 > 0 ? (ca - caN1) / caN1 : null,
    txMarge: ca > 0 ? marge/ca : 0,
    txEbe:   ca > 0 ? ebe/ca   : 0,
    txRe:    ca > 0 ? re/ca    : 0,
  }
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'10px 14px', fontSize:11, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
      <div style={{ fontWeight:700, color:'var(--text-0)', marginBottom:6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
          <span style={{ color:'var(--text-2)', flex:1 }}>{p.name}</span>
          <span style={{ fontFamily:'monospace', fontWeight:600, color:p.color }}>{fmt(p.value)} €</span>
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const RAW      = useAppStore(s => s.RAW)
  const filters  = useAppStore(s => s.filters)
  const printRef = useRef<HTMLDivElement>(null)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

  // Mois filtrés selon la période sélectionnée
  const selectedMs = useMemo(() => {
    if (!RAW?.mn?.length) return []
    if (!filters.startM || !filters.endM) return RAW.mn
    return RAW.mn.filter((m: string) =>
      monthIdx(m) >= monthIdx(filters.startM) && monthIdx(m) <= monthIdx(filters.endM)
    )
  }, [RAW?.mn?.join(','), filters.startM, filters.endM])

  // ── Données mensuelles pour graphiques ────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!selectedMs.length) return []
    return selectedMs.map((m: string) => {
      const mN1  = `${parseInt(m.slice(0,4))-1}-${m.slice(5,7)}`
      const caN  = sumAccs(RAW, selCo, 'pn', m, CA_ACCS)
      const caN1 = sumAccs(RAW, selCo, 'p1', mN1, CA_ACCS)
      const ach  = sumAccs(RAW, selCo, 'pn', m, ACHAT_ACCS, true)
      const serv = sumAccs(RAW, selCo, 'pn', m, SERV_ACCS,  true)
      const pers = sumAccs(RAW, selCo, 'pn', m, PERS_ACCS,  true)
      const amrt = sumAccs(RAW, selCo, 'pn', m, AMORT_ACCS, true)
      const marge = caN - ach
      const ebe   = marge - serv - pers
      const re    = ebe - amrt
      return { month: MONTHS_SHORT[parseInt(m.slice(5))-1], m,
        'CA N': caN, 'CA N-1': caN1, Marge: marge, EBE: ebe, Résultat: re }
    })
  }, [RAW, selCo.join(','), selectedMs.join(',')])

  // ── KPIs sur la période filtrée ───────────────────────────────────────
  const kpis = useMemo(() => {
    if (!selectedMs.length) return null
    return computeKpis(RAW, selCo, selectedMs)
  }, [RAW, selCo.join(','), selectedMs.join(',')])

  // ── Répartition charges ───────────────────────────────────────────────
  const chargesData = useMemo(() => {
    if (!selectedMs.length) return []
    const cats = [
      { name:'Achats',         prefixes:['60','601','607'],        color:CHARGE_COLORS[0] },
      { name:'Services ext.',  prefixes:['61','62'],               color:CHARGE_COLORS[1] },
      { name:'Impôts',         prefixes:['63'],                    color:CHARGE_COLORS[2] },
      { name:'Personnel',      prefixes:['641','642','645','646'], color:CHARGE_COLORS[3] },
      { name:'Amortissements', prefixes:['681'],                   color:CHARGE_COLORS[4] },
      { name:'Charges fin.',   prefixes:['66'],                    color:CHARGE_COLORS[5] },
      { name:'Autres',         prefixes:['65','67','68'],          color:CHARGE_COLORS[6] },
    ]
    return cats.map(cat => {
      let val = 0
      for (const m of selectedMs) val += sumAccs(RAW, selCo, 'pn', m, cat.prefixes, true)
      return { name: cat.name, value: Math.round(val), fill: cat.color }
    }).filter(c => c.value > 0)
  }, [RAW, selCo.join(','), selectedMs.join(',')])

  // ── Alertes ───────────────────────────────────────────────────────────
  const alertes = useMemo(() => {
    if (!kpis || !selectedMs.length) return []
    const list: { icon: string; title: string; msg: string; color: string; priority: number }[] = []
    const lastM = selectedMs[selectedMs.length - 1]
    const prevM = selectedMs[selectedMs.length - 2]
    const lastLabel = MONTHS_SHORT[parseInt(lastM.slice(5))-1]

    // — Alertes structurelles (période filtrée)
    if (kpis.re < 0)
      list.push({ icon:'🔴', priority:0, title:'Résultat négatif', color:'var(--red)',
        msg:`Perte de ${fmt(Math.abs(kpis.re))} € — Charges > Produits de ${fmt(Math.abs(kpis.re))} €` })

    if (kpis.txMarge < 0.15)
      list.push({ icon:'⚠️', priority:1, title:'Taux de marge critique', color:'var(--red)',
        msg:`${pct(kpis.txMarge)} du CA — Objectif minimum : 30%` })
    else if (kpis.txMarge < 0.25)
      list.push({ icon:'⚡', priority:2, title:'Taux de marge à surveiller', color:'var(--amber)',
        msg:`${pct(kpis.txMarge)} du CA — Une hausse de prix ou baisse des achats améliorerait la rentabilité` })

    if (kpis.txEbe < 0)
      list.push({ icon:'🔴', priority:0, title:'EBE négatif', color:'var(--red)',
        msg:`EBE de ${fmt(kpis.ebe)} € — Les charges de fonctionnement dépassent la valeur créée` })
    else if (kpis.txEbe < 0.05)
      list.push({ icon:'⚠️', priority:1, title:'EBE insuffisant', color:'var(--amber)',
        msg:`${pct(kpis.txEbe)} du CA — Seuil critique : 5% (banquiers observent ce ratio)` })
    else if (kpis.txEbe > 0.10)
      list.push({ icon:'✅', priority:3, title:'Bonne rentabilité', color:'var(--green)',
        msg:`EBE à ${pct(kpis.txEbe)} du CA — Très bonne capacité à générer de la trésorerie` })

    if (kpis.evoCa !== null) {
      if (kpis.evoCa > 0.05)
        list.push({ icon:'📈', priority:3, title:'CA en progression', color:'var(--green)',
          msg:`+${pct(kpis.evoCa)} vs N-1 — CA de ${fmt(kpis.ca)} € pour ${fmt(kpis.caN1)} € l'an passé` })
      else if (kpis.evoCa < -0.02)
        list.push({ icon:'📉', priority:1, title:'CA en recul vs N-1', color:'var(--amber)',
          msg:`${pct(kpis.evoCa)} vs N-1 — Perte de ${fmt(Math.abs(kpis.ca - kpis.caN1))} € de CA` })
    }

    // — Alertes du mois courant vs mois précédent
    if (prevM) {
      const kpisLast = computeKpis(RAW, selCo, [lastM])
      const kpisPrev = computeKpis(RAW, selCo, [prevM])
      if (kpisPrev.ca > 0 && kpisLast.ca > 0) {
        const evo = (kpisLast.ca - kpisPrev.ca) / kpisPrev.ca
        if (evo > 0.05)
          list.push({ icon:'🚀', priority:3, title:`CA ${lastLabel} en hausse`, color:'var(--green)',
            msg:`+${pct(evo)} vs mois précédent (${fmt(kpisLast.ca)} € vs ${fmt(kpisPrev.ca)} €)` })
        else if (evo < -0.05)
          list.push({ icon:'📉', priority:1, title:`Baisse CA en ${lastLabel}`, color:'var(--red)',
            msg:`${pct(evo)} vs mois précédent (${fmt(kpisLast.ca)} € vs ${fmt(kpisPrev.ca)} €)` })
      }
    }

    // Toujours afficher une synthèse
    list.push({ icon:'📊', priority:4, title:'Synthèse de la période', color:'var(--blue)',
      msg:`CA : ${fmt(kpis.ca)} € · Marge brute : ${pct(kpis.txMarge)} · EBE : ${pct(kpis.txEbe)} · Résultat : ${fmt(kpis.re)} €` })

    return list.sort((a, b) => a.priority - b.priority).slice(0, 6)
  }, [RAW, selCo.join(','), selectedMs.join(','), kpis])

  const totalCharges = chargesData.reduce((s, c) => s + c.value, 0)
  const tickFmt      = (v: number) => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)
  const lastLabel    = selectedMs.length ? MONTHS_SHORT[parseInt(selectedMs[selectedMs.length-1].slice(5))-1] : ''

  // ── Export PDF ────────────────────────────────────────────────────────
  const handlePrint = () => {
    const style = document.createElement('style')
    style.innerHTML = `@media print {
      body > * { display: none !important; }
      #__dashboard_print { display: block !important; }
      @page { size: A4 landscape; margin: 8mm; }
    }`
    document.head.appendChild(style)
    if (printRef.current) printRef.current.id = '__dashboard_print'
    window.print()
    setTimeout(() => {
      document.head.removeChild(style)
      printRef.current?.removeAttribute('id')
    }, 1000)
  }

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

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:12, color:'var(--text-2)' }}>
          {selCo.map(co => RAW.companies[co]?.name || co).join(' · ')}
          {selectedMs.length > 0 && ` · ${selectedMs.length} mois analysés`}
        </div>
        <button onClick={handlePrint} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:'var(--radius-md)', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border-1)', color:'var(--text-1)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          📄 Exporter PDF
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))', gap:12 }}>
        <KpiCard label="Chiffre d'affaires" value={`${fmt(kpis?.ca ?? 0)} €`} color="var(--green)"
          trend={kpis?.evoCa != null ? kpis.evoCa * 100 : undefined}
          sub={kpis?.caN1 ? `N-1 : ${fmt(kpis.caN1)} €` : undefined} />
        <KpiCard label="Marge brute"        value={`${fmt(kpis?.marge ?? 0)} €`} color="var(--blue)"
          sub={kpis ? `${pct(kpis.txMarge)} du CA` : undefined} />
        <KpiCard label="EBE"                value={`${fmt(kpis?.ebe ?? 0)} €`}
          color={!kpis ? 'var(--blue)' : kpis.txEbe > 0.10 ? 'var(--green)' : kpis.txEbe > 0.05 ? 'var(--amber)' : 'var(--red)'}
          sub={kpis ? `${pct(kpis.txEbe)} du CA` : undefined} />
        <KpiCard label="Résultat exploit."  value={`${fmt(kpis?.re ?? 0)} €`}
          color={!kpis ? 'var(--blue)' : kpis.re >= 0 ? 'var(--blue)' : 'var(--red)'}
          sub={kpis ? `${pct(kpis.txRe)} du CA` : undefined} />
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'14px 16px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
            🔔 Alertes — {lastLabel || 'Période sélectionnée'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:8 }}>
            {alertes.map((a, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 12px', borderRadius:'var(--radius-sm)', background:`${a.color}0f`, border:`1px solid ${a.color}30` }}>
                <span style={{ fontSize:16, flexShrink:0, lineHeight:1.3 }}>{a.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:a.color, marginBottom:2 }}>{a.title}</div>
                  <div style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.5 }}>{a.msg}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Graphique CA */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>📈 Évolution du CA — N vs N-1</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
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
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>📊 Marge · EBE · Résultat mensuels</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Bar dataKey="Marge"    fill="#3b82f6" opacity={0.8} radius={[3,3,0,0]} />
              <Bar dataKey="EBE"      fill="#f59e0b" opacity={0.85} radius={[3,3,0,0]} />
              <Bar dataKey="Résultat" fill="#10b981" opacity={0.9}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>🥧 Répartition des charges</div>
          {chargesData.length === 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:160, color:'var(--text-3)', fontSize:12 }}>Aucune charge détectée</div>
          ) : (
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:140, height:140, flexShrink:0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chargesData} cx="50%" cy="50%" innerRadius={30} outerRadius={60}
                      dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                      {chargesData.map((_, i) => <Cell key={i} fill={chargesData[i].fill} opacity={0.85} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${fmt(v)} €`]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                {chargesData.map(cat => (
                  <div key={cat.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:cat.fill, flexShrink:0 }} />
                    <span style={{ color:'var(--text-2)', flex:1 }}>{cat.name}</span>
                    <span style={{ fontFamily:'monospace', color:'var(--text-1)', fontWeight:600 }}>
                      {totalCharges > 0 ? pct(cat.value / totalCharges) : '—'}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid var(--border-0)', fontSize:10, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text-3)' }}>Total charges</span>
                  <span style={{ fontFamily:'monospace', color:'var(--text-0)', fontWeight:700 }}>{fmt(totalCharges)} €</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Résultat mensuel */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>🎯 Résultat d'exploitation mensuel</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={tickFmt} tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} width={52} />
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
