import { useState } from 'react'

const STAG_THRESHOLD = 2 // < 2% = stagnation

function TrendBadge({ trend }: { trend: number }) {
  const isStag = Math.abs(trend) < STAG_THRESHOLD
  const isUp   = trend >= STAG_THRESHOLD
  const color  = isStag ? '#94a3b8' : isUp ? '#22c55e' : '#ef4444'
  const bg     = isStag ? 'rgba(148,163,184,0.1)' : isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'

  const Arrow = () => {
    if (isStag) return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink:0 }}>
        <path d="M1.5 5.5H9.5M7 3L9.5 5.5L7 8" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    if (isUp) return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink:0 }}>
        <path d="M5.5 9V2M2.5 5L5.5 2L8.5 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink:0 }}>
        <path d="M5.5 2V9M2.5 6L5.5 9L8.5 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }

  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      fontSize:10, fontWeight:700, color,
      background: bg,
      padding:'2px 7px 2px 5px',
      borderRadius:20,
      border:`1px solid ${color}25`,
    }}>
      <Arrow />
      {isStag ? '~' : (isUp ? '+' : '')}{Math.abs(trend).toFixed(1)}%
    </span>
  )
}

interface KpiCardProps {
  label: string
  value: string
  color?: string
  sub?: string
  trend?: number   // % de variation N vs N-1
  icon?: string
  onInfo?: () => void
  tooltip?: string  // texte affiché au survol
}

export function KpiCard({ label, value, color = 'var(--blue)', sub, trend, icon, onInfo, tooltip }: KpiCardProps) {
  const [showTip, setShowTip] = useState(false)
  return (
    <div
      onMouseEnter={() => tooltip && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={{
        background: 'var(--bg-1)',
        borderRadius: 16,
        padding: '14px 16px',
        border: '1px solid var(--border-1)',
        boxShadow: '0 2px 5px rgba(20,30,60,0.05)',
        display: 'flex', flexDirection: 'column', gap: 6,
        position: 'relative', overflow: 'visible',
      }}>
      {/* Puce à icône colorée */}
      <div style={{ width:38, height:38, borderRadius:11, background:`color-mix(in srgb, ${color} 20%, transparent)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, lineHeight:1, marginBottom:2 }}>
        {icon || '📊'}
      </div>

      {/* Info button */}
      {onInfo && (
        <button
          onClick={onInfo}
          title="Voir l'explication"
          className="print-hide"
          style={{ position:'absolute', top:12, right:12, background:'var(--bg-2)', border:'1px solid var(--border-1)', borderRadius:6, width:22, height:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--text-3)', lineHeight:1 }}
        >ℹ</button>
      )}

      {/* Label + trend */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</div>
        {trend !== undefined && <TrendBadge trend={trend} />}
      </div>

      {/* Valeur */}
      <div style={{ fontSize:24, fontWeight:800, color, letterSpacing:'-0.5px', fontFamily:'JetBrains Mono, monospace', lineHeight:1.1, whiteSpace:'nowrap' }}>
        {value}
      </div>

      {/* Sous-titre */}
      {sub && <div style={{ fontSize:11, color:'var(--text-3)' }}>{sub}</div>}

      {/* Tooltip survol */}
      {tooltip && showTip && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)',
          background:'var(--bg-1)', border:'1px solid var(--border-1)', borderRadius:8,
          padding:'10px 14px', fontSize:11, color:'var(--text-2)', lineHeight:1.6,
          maxWidth:260, zIndex:200, boxShadow:'0 8px 24px rgba(20,30,60,0.18)',
          pointerEvents:'none', whiteSpace:'normal',
        }}>
          {tooltip}
        </div>
      )}
    </div>
  )
}
