interface ExportBarProps {
  onPdf: () => void
  onExcel: () => void
  info?: string
}

export function ExportBar({ onPdf, onExcel, info }: ExportBarProps) {
  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 'var(--radius-md, 8px)',
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-1)',
    color: 'var(--text-1)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div className="print-hide" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{info}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onPdf} style={btnStyle}>PDF</button>
        <button onClick={onExcel} style={btnStyle}>Excel</button>
      </div>
    </div>
  )
}
