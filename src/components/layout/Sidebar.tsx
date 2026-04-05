import { useAppStore, useRAW } from '@/store'
import { getCoColor } from '@/lib/calc'
import type { NavItem, TabId } from '@/types'

const NAV: NavItem[] = [
  { id: 'dashboard',       label: 'Dashboard',        icon: '🏠', group: 'ops'     },
  { id: 'saisie',         label: 'Saisie',          icon: '📝', group: 'ops'     },
  { id: 'tresorerie',     label: 'Trésorerie',       icon: '💧', group: 'ops'     },
  { id: 'equilibre',      label: 'Équilibre',        icon: '⚖️', group: 'ops'     },
  { id: 'budget',         label: 'Budget',           icon: '💰', group: 'ops'     },
  { id: 'objectifs',      label: 'Objectifs',        icon: '🎯', group: 'ops'     },
  { id: 'cr',             label: 'Compte résultat',  icon: '📋', group: 'analyse' },
  { id: 'sig',            label: 'SIG',              icon: '📊', group: 'analyse' },
  { id: 'bilan',          label: 'Bilan',            icon: '🏦', group: 'analyse' },
  { id: 'ratios',         label: 'Ratios',           icon: '📐', group: 'analyse' },
  { id: 'complementaire', label: 'Complémentaire',   icon: '📈', group: 'analyse' },
  { id: 'import',         label: 'Import',           icon: '📁', group: 'admin'   },
  { id: 'verification',   label: 'Vérification',     icon: '🔍', group: 'admin'   },
  { id: 'aide',           label: 'Aide',             icon: '❓', group: 'aide'    },
]

const GROUPS: Record<string, string> = {
  ops: 'Opérationnel', analyse: 'Analyse', admin: 'Admin', aide: '',
}

export function Sidebar() {
  const tab      = useAppStore(s => s.tab)
  const setTab   = useAppStore(s => s.setTab)
  const filters  = useAppStore(s => s.filters)
  const setFilters = useAppStore(s => s.setFilters)
  const RAW      = useRAW()
  const user     = useAppStore(s => s.user)

  const coLabel = filters.selCo.length === 1
    ? (RAW?.companies[filters.selCo[0]]?.name || filters.selCo[0]).slice(0, 16)
    : filters.selCo.length > 1 ? 'Multi-sociétés' : '—'

  return (
    <aside style={{
      width: 220, minWidth: 220, height: '100vh', position: 'sticky', top: 0,
      background: 'var(--bg-1)', borderRight: '1px solid var(--border-0)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0,
    }}>

      {/* Logo */}
      <div style={{ padding: '20px 16px 14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
            📊
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text-0)', letterSpacing:'-0.3px' }}>
              <span style={{ color:'var(--blue)' }}>adam</span>boards
            </div>
            <div style={{ fontSize:9.5, color:'var(--text-3)', fontWeight:500 }}>Tableau de bord financier</div>
          </div>
        </div>

        {/* Carte société */}
        <div style={{ background:'var(--bg-2)', borderRadius:8, padding:'10px 12px', border:'1px solid var(--border-1)' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text-0)', marginBottom:2 }}>{coLabel}</div>
          <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user?.email}
          </div>
          {RAW?.keys && RAW.keys.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {RAW.keys.map(k => {
                const active = filters.selCo.includes(k)
                const color  = getCoColor(k)
                return (
                  <button key={k}
                    onClick={() => {
                      const next = active ? filters.selCo.filter(x => x !== k) : [...filters.selCo, k]
                      setFilters({ selCo: next })
                    }}
                    style={{
                      padding:'3px 8px', borderRadius:20, fontSize:10, fontWeight:600, cursor:'pointer',
                      border: `1px solid ${active ? color : 'var(--border-1)'}`,
                      background: active ? `${color}20` : 'transparent',
                      color: active ? color : 'var(--text-3)',
                      transition:'all 0.12s',
                    }}>
                    {(RAW.companies[k]?.name || k).slice(0, 10).replace(/_/g,' ')}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex:1, padding:'4px 8px' }}>
        {(() => {
          let lastGroup: string | null = null
          return NAV.map(item => {
            const active    = tab === item.id
            const showGroup = item.group !== lastGroup && GROUPS[item.group] !== undefined
            if (showGroup) lastGroup = item.group

            return (
              <div key={item.id}>
                {showGroup && GROUPS[item.group] && (
                  <div style={{ padding:'12px 8px 4px', fontSize:9.5, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'1px' }}>
                    {GROUPS[item.group]}
                  </div>
                )}
                <button
                  onClick={() => setTab(item.id as TabId)}
                  style={{
                    width:'100%', display:'flex', alignItems:'center', gap:8,
                    padding:'7px 8px', borderRadius:'var(--radius-sm)', border:'none', cursor:'pointer',
                    background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: active ? 'var(--text-0)' : 'var(--text-2)',
                    fontSize:12.5, fontWeight: active ? 600 : 400,
                    textAlign:'left', transition:'all 0.1s', marginBottom:1,
                    boxShadow: active ? 'inset 0 0 0 1px rgba(59,130,246,0.2)' : 'none',
                  }}>
                  <span style={{ fontSize:13, width:18, textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                  <span style={{ flex:1 }}>{item.label}</span>
                  {active && <span style={{ width:4, height:4, borderRadius:'50%', background:'var(--blue)', flexShrink:0 }} />}
                </button>
              </div>
            )
          })
        })()}
      </nav>

      {/* Footer */}
      <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border-0)' }}>
        {RAW?.mn && RAW.mn.length > 0 && (
          <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:2 }}>
            N : {RAW.mn[0]?.slice(0,7)} → {RAW.mn[RAW.mn.length-1]?.slice(0,7)}
          </div>
        )}
        {RAW?.m1 && RAW.m1.length > 0 && (
          <div style={{ fontSize:10, color:'var(--text-3)', marginBottom:6 }}>
            N-1 : {RAW.m1[0]?.slice(0,7)} → {RAW.m1[RAW.m1.length-1]?.slice(0,7)}
          </div>
        )}
        <span style={{
          fontSize:9.5, fontWeight:700, padding:'2px 8px', borderRadius:20,
          background: 'rgba(245,158,11,0.12)',
          color: '#f59e0b',
          border: '1px solid rgba(245,158,11,0.2)',
        }}>
          ● TEST
        </span>
      </div>
    </aside>
  )
}
