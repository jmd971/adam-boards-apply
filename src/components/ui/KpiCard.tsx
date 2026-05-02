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
}

export function KpiCard({ label, value, color = '#3b82f6', sub, trend, icon, onInfo }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--bg-1)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      border: '1px solid var(--border-1)',
      display: 'flex', flexDirection: 'column', gap: 6,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Accent bar top */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background: color, opacity: 0.6, borderRadius:'var(--radius-lg) var(--radius-lg) 0 0' }} />

      {/* Info button */}
      {onInfo && (
        <button
          onClick={onInfo}
          title="Voir l'explication"
          className="print-hide"
          style={{ position:'absolute', top:10, right:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6, width:22, height:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#475569', lineHeight:1, transition:'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,130,246,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#93c5fd' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#475569' }}
        >ℹ</button>
      )}

      {/* Label + trend */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-1)', textTransform:'uppercase', letterSpacing:'0.6px' }}>
          {icon && <span style={{ marginRight: 5 }}>{icon}</span>}
          {label}
        </div>
        {trend !== undefined && <TrendBadge trend={trend} />}
      </div>

      {/* Valeur */}
      <div style={{ fontSize:26, fontWeight:800, color, letterSpacing:'-0.5px', fontFamily:'JetBrains Mono, monospace', lineHeight:1.1 }}>
        {value}
      </div>

      {/* Sous-titre */}
      {sub && <div style={{ fontSize:11, color:'var(--text-2)' }}>{sub}</div>}
    </div>
  )
}
