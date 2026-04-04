interface PlaceholderProps {
  icon: string
  label: string
  description?: string
}

export function Placeholder({ icon, label, description }: PlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-8">
      <div className="text-4xl">{icon}</div>
      <div>
        <div className="text-base font-bold text-white mb-1">{label}</div>
        <div className="text-xs text-muted max-w-xs">
          {description || 'Ce module sera disponible dans la prochaine version.'}
        </div>
      </div>
      <div className="px-3 py-1.5 rounded-full text-[11px] font-semibold"
        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
        En développement
      </div>
    </div>
  )
}
