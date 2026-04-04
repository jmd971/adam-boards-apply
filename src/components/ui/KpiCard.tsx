interface KpiCardProps {
  label: string
  value: string
  color?: string
  sub?: string
}

export function KpiCard({ label, value, color = '#3b82f6', sub }: KpiCardProps) {
  return (
    <div className="rounded-xl p-4 border border-white/5 bg-bg-secondary flex flex-col gap-1">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}
