interface BadgeProps { children: React.ReactNode; color?: 'blue'|'green'|'red'|'amber'|'purple'|'muted' }
const C = { blue:'var(--blue)', green:'var(--green)', red:'var(--red)', amber:'var(--amber)', purple:'var(--purple)', muted:'var(--text-2)' }
export function Badge({ children, color = 'muted' }: BadgeProps) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, color:C[color], background:`${C[color]}18`, border:`1px solid ${C[color]}30` }}>
      {children}
    </span>
  )
}
