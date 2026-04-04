interface KpiCardProps {
  label: string
  value: string
  color?: string
  sub?: string
  trend?: number   // % de variation (positif = vert, négatif = rouge)
  icon?: string
}

export function KpiCard({ label, value, color = '#3b82f6', sub, trend, icon }: KpiCardProps) {
  const trendColor = trend === undefined ? '' : trend >= 0 ? '#22c55e' : '#ef4444'
  const trendIcon  = trend === undefined ? '' : trend >= 0 ? '↑' : '↓'

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

      {/* Label */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'0.6px' }}>
          {icon && <span style={{ marginRight: 5 }}>{icon}</span>}
          {label}
        </div>
        {trend !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, color: trendColor, background: `${trendColor}15`, padding:'1px 6px', borderRadius:20 }}>
            {trendIcon} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
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
