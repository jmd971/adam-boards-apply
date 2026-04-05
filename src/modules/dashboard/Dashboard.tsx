import { useMemo } from 'react'
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

// Tooltip stylisé pour Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'10px 14px', fontSize:11 }}>
      <div style={{ fontWeight:700, color:'var(--text-1)', marginBottom:6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
          <span style={{ color:'var(--text-2)' }}>{p.name}</span>
          <span style={{ fontFamily:'monospace', fontWeight:600, color:p.color, marginLeft:'auto' }}>{fmt(p.value)} €</span>
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

export function Dashboard() {
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)

  const selCo = filters.selCo.length > 0 ? filters.selCo : (RAW?.keys ?? [])

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
      const margeN = caN - ach
      const ebe    = margeN - serv - pers
      const re     = ebe - amrt
      return {
        month: MONTHS_SHORT[parseInt(m.slice(5))-1],
        'CA N':     caN,
        'CA N-1':   caN1,
        'Marge':    margeN,
        'EBE':      ebe,
        'Résultat': re,
      }
    })
  }, [RAW, selCo.join(',')])

  // ── KPIs annuels ─────────────────────────────────────────────────────
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
    const marge  = ca - ach
    const ebe    = marge - serv - pers
    const re     = ebe - amrt
    const evoCa  = caN1 > 0 ? (ca - caN1) / caN1 : null
    return { ca, caN1, marge, ebe, re, evoCa,
      txMarge: ca > 0 ? marge/ca : 0,
      txEbe:   ca > 0 ? ebe/ca   : 0,
      txRe:    ca > 0 ? re/ca    : 0,
    }
  }, [RAW, selCo.join(',')])

  // ── Répartition des charges (camembert) ────────────────────────────────
  const chargesData = useMemo(() => {
    if (!RAW?.mn?.length) return []
    const cats = [
      { name:'Achats',         prefixes:['60','601','607'],  color:CHARGE_COLORS[0] },
      { name:'Services ext.',  prefixes:['61','62'],         color:CHARGE_COLORS[1] },
      { name:'Impôts',         prefixes:['63'],              color:CHARGE_COLORS[2] },
      { name:'Personnel',      prefixes:['641','642','645','646'], color:CHARGE_COLORS[3] },
      { name:'Amortissements', prefixes:['681'],             color:CHARGE_COLORS[4] },
      { name:'Charges fin.',   prefixes:['66'],              color:CHARGE_COLORS[5] },
      { name:'Autres',         prefixes:['65','67','68'],    color:CHARGE_COLORS[6] },
    ]
    return cats.map(cat => {
      let val = 0
      for (const m of RAW.mn) val += sumAccs(RAW, selCo, 'pn', m, cat.prefixes, true)
      return { name: cat.name, value: Math.round(val), fill: cat.color }
    }).filter(c => c.value > 0)
  }, [RAW, selCo.join(',')])

  // ── Alertes ───────────────────────────────────────────────────────────
  const alertes = useMemo(() => {
    if (!kpis) return []
    const list: { msg: string; color: string; icon: string }[] = []
    if (kpis.evoCa !== null && kpis.evoCa < -0.05) list.push({ icon:'📉', msg:`CA en baisse de ${pct(Math.abs(kpis.evoCa))} vs N-1`, color:'var(--red)' })
    if (kpis.evoCa !== null && kpis.evoCa > 0.10)  list.push({ icon:'📈', msg:`CA en hausse de +${pct(kpis.evoCa)} vs N-1`, color:'var(--green)' })
    if (kpis.txMarge < 0.20) list.push({ icon:'⚠️', msg:`Taux de marge faible : ${pct(kpis.txMarge)} (seuil recommandé : 30%)`, color:'var(--amber)' })
    if (kpis.txEbe < 0.05)   list.push({ icon:'⚠️', msg:`EBE serré : ${pct(kpis.txEbe)} du CA (seuil critique : 5%)`, color:'var(--amber)' })
    if (kpis.re < 0)         list.push({ icon:'🔴', msg:`Résultat d'exploitation négatif : ${fmt(kpis.re)} €`, color:'var(--red)' })
    if (kpis.txEbe > 0.15)   list.push({ icon:'✅', msg:`Excellente rentabilité : EBE à ${pct(kpis.txEbe)} du CA`, color:'var(--green)' })
    return list
  }, [kpis])

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

  const totalCharges = chargesData.reduce((s, c) => s + c.value, 0)

  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
        <KpiCard label="Chiffre d'affaires" value={`${fmt(kpis?.ca ?? 0)} €`} color="var(--green)"
          trend={kpis?.evoCa != null ? kpis.evoCa * 100 : undefined}
          sub={kpis?.caN1 ? `N-1 : ${fmt(kpis.caN1)} €` : undefined} />
        <KpiCard label="Marge brute"        value={`${fmt(kpis?.marge ?? 0)} €`} color="var(--blue)"
          sub={kpis ? `${pct(kpis.txMarge)} du CA` : undefined} />
        <KpiCard label="EBE"                value={`${fmt(kpis?.ebe ?? 0)} €`}
          color={kpis && kpis.txEbe > 0.10 ? 'var(--green)' : kpis && kpis.txEbe > 0.05 ? 'var(--amber)' : 'var(--red)'}
          sub={kpis ? `${pct(kpis.txEbe)} du CA` : undefined} />
        <KpiCard label="Résultat exploit."  value={`${fmt(kpis?.re ?? 0)} €`}
          color={kpis && kpis.re >= 0 ? 'var(--blue)' : 'var(--red)'}
          sub={kpis ? `${pct(kpis.txRe)} du CA` : undefined} />
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {alertes.map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8,
              background:`${a.color}0f`, border:`1px solid ${a.color}30`, fontSize:12 }}>
              <span>{a.icon}</span>
              <span style={{ color:a.color, fontWeight:500 }}>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ligne 1 : CA mensuel */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
          📈 Évolution du CA — N vs N-1
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Line type="monotone" dataKey="CA N"   stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r:4 }} />
            <Line type="monotone" dataKey="CA N-1" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Ligne 2 : EBE + Répartition charges */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16 }}>

        {/* EBE et Marge */}
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
            📊 Marge & EBE mensuels
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Bar dataKey="Marge"     fill="#3b82f6" opacity={0.75} radius={[3,3,0,0]} />
              <Bar dataKey="EBE"       fill="#f59e0b" opacity={0.85} radius={[3,3,0,0]} />
              <Bar dataKey="Résultat"  fill="#10b981" opacity={0.9}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Répartition charges */}
        <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>
            🥧 Répartition des charges
          </div>
          {chargesData.length === 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:180, color:'var(--text-3)', fontSize:12 }}>Aucune charge détectée</div>
          ) : (
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie data={chargesData} cx="50%" cy="50%" innerRadius={35} outerRadius={65}
                    dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                    {chargesData.map((c, i) => <Cell key={i} fill={c.fill} opacity={0.85} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
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
                  <span style={{ color:'var(--text-3)' }}>Total charges</span>
                  <span style={{ fontFamily:'monospace', color:'var(--text-0)', fontWeight:700 }}>{fmt(totalCharges)} €</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ligne 3 : Tendances mensuelles */}
      <div style={{ background:'var(--bg-1)', borderRadius:'var(--radius-lg)', padding:'16px 20px', border:'1px solid var(--border-1)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:14 }}>
          🎯 Résultat d'exploitation mensuel
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={monthlyData} margin={{ top:4, right:16, left:0, bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}k` : String(v)} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
            <Bar dataKey="Résultat" radius={[3,3,0,0]}>
              {monthlyData.map((m, i) => (
                <Cell key={i} fill={(m as any)['Résultat'] >= 0 ? '#10b981' : '#ef4444'} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  )
}
