import { useAppStore } from '@/store'
import type { TabId } from '@/types'
import { canAccessTab, roleLabel, roleColor, type Role } from '@/lib/roles'

interface SidebarProps { onTabChange?: (t: TabId) => void }

const NAV: { id: TabId; label: string; icon: string; group: string }[] = [
  { id:'dashboard',       label:'Dashboard',         icon:'🏠', group:'ops'     },
  { id:'saisie',          label:'Saisie',             icon:'📝', group:'ops'     },
  { id:'tresorerie',      label:'Trésorerie',         icon:'💧', group:'ops'     },
  { id:'equilibre',       label:'Équilibre',          icon:'⚖️', group:'ops'     },
  { id:'budget',          label:'Budget',             icon:'💰', group:'ops'     },
  { id:'objectifs',       label:'Objectifs',          icon:'🎯', group:'ops'     },
  { id:'cr',              label:'Compte résultat',    icon:'📋', group:'analyse' },
  { id:'sig',             label:'SIG',                icon:'📊', group:'analyse' },
  { id:'bilan',           label:'Bilan',              icon:'🏦', group:'analyse' },
  { id:'ratios',          label:'Ratios',             icon:'📐', group:'analyse' },
  { id:'complementaire',  label:'Complémentaire',     icon:'📈', group:'analyse' },
  { id:'creances',        label:'Créances clients',   icon:'📋', group:'analyse' },
  { id:'import',          label:'Import',             icon:'📁', group:'admin'   },
  { id:'verification',    label:'Vérification',       icon:'🔍', group:'admin'   },
  { id:'aide',            label:'Aide',               icon:'❓', group:'admin'   },
]

const GROUPS = [
  { key:'ops',     label:'OPÉRATIONNEL' },
  { key:'analyse', label:'ANALYSE'      },
  { key:'admin',   label:'ADMIN'        },
]

export function Sidebar({ onTabChange }: SidebarProps) {
  const tab     = useAppStore(s => s.tab)
  const setTab  = useAppStore(s => s.setTab)
  const user    = useAppStore(s => s.user)
  const role    = useAppStore(s => s.role) as Role
  const RAW     = useAppStore(s => s.RAW)
  const filters = useAppStore(s => s.filters)
  const setFilters = useAppStore(s => s.setFilters)

  const handleTab = (id: TabId) => {
    setTab(id)
    onTabChange?.(id)
  }

  const companies = RAW?.keys ?? []
  const selCo = filters.selCo

  return (
    <aside style={{
      width: 232, height:'100vh', background:'var(--bg-1)',
      borderRight:'1px solid var(--border-0)',
      display:'flex', flexDirection:'column',
      overflowY:'auto', overflowX:'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding:'18px 16px 12px', borderBottom:'1px solid var(--border-0)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📊</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#f1f5f9', letterSpacing:'-0.3px' }}>
              <span style={{ color:'#3b82f6' }}>adam</span>boards
            </div>
            <div style={{ fontSize:9, color:'#475569', letterSpacing:'1.5px', textTransform:'uppercase', marginTop:1 }}>Tableau de bord financier</div>
          </div>
        </div>
      </div>

      {/* Sélecteur sociétés */}
      {companies.length > 0 && (
        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border-0)', flexShrink:0 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'1px', textTransform:'uppercase', marginBottom:6 }}>
            {user?.email?.split('@')[0] ?? 'Compte'}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {companies.map(co => {
              const isSelected = selCo.includes(co)
              const name = RAW?.companies[co]?.name || co
              return (
                <button key={co} onClick={() => {
                  const next = isSelected && selCo.length > 1
                    ? selCo.filter(c => c !== co)
                    : isSelected ? selCo : [...selCo, co]
                  setFilters({ selCo: next.length ? next : [co] })
                }} style={{
                  padding:'4px 10px', borderRadius:20, fontSize:10, fontWeight:700,
                  cursor:'pointer', border:'none', transition:'all 0.15s',
                  background: isSelected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color:      isSelected ? '#93c5fd' : '#64748b',
                  boxShadow:  isSelected ? 'inset 0 0 0 1px rgba(59,130,246,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                }}>
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex:1, padding:'8px 0 12px', overflowY:'auto' }}>
        {GROUPS.map(g => {
          const items = NAV.filter(n => n.group === g.key && canAccessTab(role, n.id))
          return (
            <div key={g.key}>
              <div style={{ padding:'12px 16px 4px', fontSize:9, fontWeight:700, letterSpacing:'1.2px', color:'#334155', textTransform:'uppercase' }}>
                {g.label}
              </div>
              {items.map(item => {
                const active = tab === item.id
                return (
                  <button key={item.id} onClick={() => handleTab(item.id)}
                    style={{
                      width:'100%', display:'flex', alignItems:'center', gap:10,
                      padding:'9px 16px', border:'none', cursor:'pointer',
                      background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                      borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                      color: active ? '#f1f5f9' : '#94a3b8',
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      textAlign:'left', transition:'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {active && <span style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background:'#3b82f6', flexShrink:0 }} />}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      {user && (
        <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border-0)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <div style={{ fontSize:10, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{user.email}</div>
            <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10, background:`${roleColor(role)}20`, color:roleColor(role), whiteSpace:'nowrap' }}>
              {roleLabel(role)}
            </span>
          </div>
          {RAW?.mn?.length && (
            <div style={{ fontSize:9, color:'#334155' }}>
              N: {RAW.mn[0]} → {RAW.mn[RAW.mn.length-1]}
              {RAW.m1?.length ? `\nN-1: ${RAW.m1[0]} → ${RAW.m1[RAW.m1.length-1]}` : ''}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
