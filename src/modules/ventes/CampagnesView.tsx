import { useState } from 'react'
import { fmt } from '@/lib/calc'
import { SEGMENT_LABELS, SEGMENT_COLORS, SEGMENT_ACTIONS, exportToGHL, type ClientRFM, type RFMSegment } from '@/lib/rfm'

interface Props { clients: ClientRFM[] }

const ORDER: RFMSegment[] = ['champion','fidele','potentiel','one_shot','a_risque','perdu']
const ICONS: Record<RFMSegment, string> = {
  champion:'🏆', fidele:'💛', potentiel:'🌱', one_shot:'👋', a_risque:'⚠️', perdu:'💤',
}

export function CampagnesView({ clients }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    champion:true, fidele:true, potentiel:true, one_shot:true, a_risque:true, perdu:false,
  })

  const bySegment = ORDER
    .map(seg => ({ seg, list: clients.filter(c => c.segment === seg) }))
    .filter(s => s.list.length > 0)

  return (
    <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:4 }}>
        💡 Pour chaque segment : exportez les contacts vers GoHighLevel, puis appliquez les campagnes recommandées.
      </div>

      {bySegment.map(({ seg, list }) => {
        const isOpen   = !!expanded[seg]
        const color    = SEGMENT_COLORS[seg]
        const totalCA  = list.reduce((s, c) => s + c.ca, 0)
        const actions  = SEGMENT_ACTIONS[seg]

        return (
          <div key={seg} style={{
            background:'var(--bg-1)', borderRadius:'var(--radius-lg)',
            border:`1px solid ${isOpen ? color + '44' : 'var(--border-1)'}`,
            overflow:'hidden', transition:'border-color 0.15s',
          }}>
            {/* En-tête du segment */}
            <div
              onClick={() => setExpanded(e => ({ ...e, [seg]: !e[seg] }))}
              style={{
                display:'flex', alignItems:'center', gap:14, padding:'14px 18px',
                cursor:'pointer', background: isOpen ? color + '0d' : 'transparent',
              }}
            >
              <span style={{ fontSize:20 }}>{ICONS[seg]}</span>
              <div style={{ flex:1 }}>
                <span style={{ fontWeight:700, color, fontSize:13 }}>{SEGMENT_LABELS[seg]}</span>
                <span style={{ marginLeft:10, fontSize:11, color:'var(--text-3)' }}>
                  {list.length} client{list.length > 1 ? 's' : ''} · CA {fmt(totalCA)} €
                </span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); exportToGHL(list, seg) }}
                style={{
                  padding:'5px 14px', borderRadius:8,
                  border:`1px solid ${color}44`, background: color + '22',
                  color, fontSize:11, fontWeight:700, cursor:'pointer',
                }}
              >
                ↓ Export GHL ({list.length})
              </button>
              <span style={{ color:'var(--text-3)', fontSize:14, marginLeft:4 }}>{isOpen ? '▾' : '▸'}</span>
            </div>

            {/* Corps */}
            {isOpen && (
              <div style={{ padding:'0 18px 18px', display:'flex', gap:16, flexWrap:'wrap' }}>
                {/* Actions recommandées */}
                <div style={{ flex:1, minWidth:280 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
                    Actions recommandées pour GHL
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {actions.map((a, i) => (
                      <div key={i} style={{
                        background:'var(--bg-0)', borderRadius:8, padding:'10px 14px',
                        border:'1px solid var(--border-1)', borderLeft:`3px solid ${color}`,
                      }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-0)' }}>{a.title}</div>
                        <div style={{ fontSize:11, color:'var(--text-2)', marginTop:3 }}>{a.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top clients */}
                <div style={{ width:240 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>
                    Top clients
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {list.slice(0, 6).map(c => (
                      <div key={c.key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--bg-0)', borderRadius:6 }}>
                        <div style={{ flex:1, fontSize:11, color:'var(--text-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nom}</div>
                        <div style={{ fontSize:11, fontFamily:'monospace', color:'var(--green)', whiteSpace:'nowrap' }}>{fmt(c.ca)} €</div>
                      </div>
                    ))}
                    {list.length > 6 && (
                      <div style={{ fontSize:10, color:'var(--text-3)', textAlign:'center', padding:'4px 0' }}>
                        +{list.length - 6} autres
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
