export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', border:'2px solid var(--border-1)', borderTopColor:'var(--blue)' }}
      className="animate-spin" />
  )
}
