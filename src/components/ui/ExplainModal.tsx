// Shared explanation modal used by Ratios and Dashboard

export interface Explanation {
  title: string
  definition: string
  formula: string
  reading: { label: string; color: string }[]
  tip?: string
}

export function ExplainModal({ expl, onClose }: { expl: Explanation; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="ab-light"
        style={{ background:'var(--bg-1)', borderRadius:16, padding:'24px 28px', maxWidth:520, width:'100%', border:'1px solid var(--border-1)', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, gap:12 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:'var(--text-0)' }}>{expl.title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0, flexShrink:0 }}>✕</button>
        </div>

        {/* Definition */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#1e88c7', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:5 }}>Définition</div>
          <p style={{ margin:0, fontSize:12, color:'var(--text-1)', lineHeight:1.7 }}>{expl.definition}</p>
        </div>

        {/* Formula */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#8b5cf6', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:5 }}>Calcul</div>
          <div style={{ background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:8, padding:'8px 12px' }}>
            {expl.formula.split('\n').map((line, i) => (
              <div key={i} style={{ fontFamily:'monospace', fontSize:11, color:'#a78bfa', lineHeight:1.8 }}>{line}</div>
            ))}
          </div>
        </div>

        {/* Reading */}
        <div style={{ marginBottom: expl.tip ? 14 : 0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#10b981', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:7 }}>Lecture</div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {expl.reading.map((r, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:r.color, flexShrink:0, marginTop:4 }} />
                <span style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.6 }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tip */}
        {expl.tip && (
          <div style={{ marginTop:14, padding:'8px 12px', borderRadius:8, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', display:'flex', gap:8, alignItems:'flex-start' }}>
            <span style={{ fontSize:13, flexShrink:0 }}>💡</span>
            <span style={{ fontSize:11, color:'#fcd34d', lineHeight:1.6 }}>{expl.tip}</span>
          </div>
        )}
      </div>
    </div>
  )
}
