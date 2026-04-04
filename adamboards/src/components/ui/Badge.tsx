interface BadgeProps {
  children: React.ReactNode
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'muted'
}

const colors = {
  blue:   'bg-brand-blue/15 text-brand-blue border-brand-blue/25',
  green:  'bg-brand-green/15 text-brand-green border-brand-green/25',
  red:    'bg-brand-red/15 text-brand-red border-brand-red/25',
  amber:  'bg-brand-amber/15 text-brand-amber border-brand-amber/25',
  purple: 'bg-brand-purple/15 text-brand-purple border-brand-purple/25',
  muted:  'bg-white/5 text-muted border-white/10',
}

export function Badge({ children, color = 'muted' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[color]}`}>
      {children}
    </span>
  )
}
