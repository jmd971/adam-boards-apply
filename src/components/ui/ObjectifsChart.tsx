import { useMemo } from 'react'
import { fmt } from '@/lib/calc'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts'

export interface ObjKpi {
  label: string
  icon:  string
  color: string
  real:  number
  bud:   number
}

function ObjTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const color = d.pct >= 100 ? '#10b981' : d.pct >= 75 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ background:'#0d1424', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'10px 14px', fontSize:11, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
      <div style={{ fontWeight:700, color:'var(--text-0)', marginBottom:6 }}>{d.subject}</div>
      <div style={{ display:'flex', gap:6, marginBottom:3 }}>
        <span style={{ color:'var(--text-2)', minWidth:55 }}>Réalisé :</span>
        <span style={{ fontFamily:'monospace', fontWeight:600, color:'#10b981' }}>{fmt(d.real)} €</span>
      </div>
      <div style={{ display:'flex', gap:6, marginBottom:6 }}>
        <span style={{ color:'var(--text-2)', minWidth:55 }}>Budget :</span>
        <span style={{ fontFamily:'monospace', fontWeight:600, color:'#3b82f6' }}>{fmt(d.bud)} €</span>
      </div>
      <div style={{ fontWeight:700, color, fontSize:12 }}>{d.pct}% de l'objectif</div>
    </div>
  )
}

interface ObjectifsChartProps {
  kpis:      ObjKpi[]
  hasBudget: boolean
  height?:   number
}

export function ObjectifsChart({ kpis, hasBudget, height = 300 }: ObjectifsChartProps) {
  const radarData = useMemo(() =>
    kpis
      .filter(k => k.bud !== 0)
      .map(k => {
        const short = k.label
          .replace("Chiffre d'affaires", 'CA')
          .replace('Résultat exploit.', 'Rés. expl.')
          .replace('Résultat net', 'Rés. net')
          .replace('Valeur ajoutée', 'Valeur aj.')
        const pct = k.bud !== 0 ? Math.min(120, Math.max(0, Math.round((k.real / k.bud) * 100))) : 0
        return { subject: short, pct, target: 100, real: k.real, bud: k.bud }
      })
  , [kpis])

  if (!hasBudget || radarData.length === 0) {
    return (
      <div style={{ textAlign:'center', padding:'24px 0', fontSize:12, color:'var(--text-3)' }}>
        Aucun objectif budgétaire défini.<br/>
        Créez un budget pour voir les réalisations.
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={radarData} margin={{ top:20, right:50, bottom:20, left:50 }}>
          <PolarGrid stroke="rgba(255,255,255,0.07)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill:'var(--text-2)', fontSize:10, fontWeight:600 }} />
          <PolarRadiusAxis
            angle={90} domain={[0, 120]} tick={{ fill:'var(--text-3)', fontSize:9 }}
            tickCount={4} tickFormatter={(v: number) => `${v}%`}
          />
          <Radar name="Réalisé %" dataKey="pct"
            stroke="#10b981" fill="#10b981" fillOpacity={0.22} strokeWidth={2}
          />
          <Radar name="Objectif (100 %)" dataKey="target"
            stroke="rgba(59,130,246,0.55)" fill="transparent"
            strokeDasharray="5 3" strokeWidth={1.5}
          />
          <Tooltip content={<ObjTooltip />} />
          <Legend
            wrapperStyle={{ fontSize:10 }}
            formatter={(v: string) => <span style={{ color:'var(--text-2)', fontSize:10 }}>{v}</span>}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center', marginTop:6 }}>
        {radarData.map(d => {
          const color = d.pct >= 100 ? '#10b981' : d.pct >= 75 ? '#f59e0b' : '#ef4444'
          return (
            <div key={d.subject} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:`${color}15`, border:`1px solid ${color}35` }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:color, flexShrink:0 }} />
              <span style={{ fontSize:10, color:'var(--text-2)', fontWeight:600 }}>{d.subject}</span>
              <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color }}>{d.pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
