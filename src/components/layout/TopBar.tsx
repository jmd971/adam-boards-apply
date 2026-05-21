import { useAppStore } from '@/store'
import { monthIdx, monthLabel } from '@/lib/calc'

const TAB_META: Record<string, { label: string; icon: string }> = {
  dashboard:      { label:'Dashboard',            icon:'🏠' },
  cr:             { label:'Compte de résultat',  icon:'📋' },
  sig:            { label:'SIG',                  icon:'📊' },
  equilibre:      { label:'Équilibre',            icon:'⚖️' },
  objectifs:      { label:'Objectifs',            icon:'🎯' },
  bilan:          { label:'Bilan',                icon:'🏦' },
  ratios:         { label:'Ratios',               icon:'📐' },
  import:         { label:'Import FEC',           icon:'📁' },
  budget:         { label:'Budget',               icon:'💰' },
  saisie:         { label:'Saisie',               icon:'📝' },
  verification:   { label:'Vérification',         icon:'🔍' },
  complementaire: { label:'Complémentaire',       icon:'📈' },
  tresorerie:     { label:'Trésorerie',           icon:'💧' },
  creances:       { label:'Créances clients',      icon:'📋' },
  aide:           { label:'Aide',                 icon:'❓' },
  parametres:     { label:'Paramètres',           icon:'⚙️' },
}

const PL_TABS       = ['cr','sig','equilibre']
const ANALYSIS_TABS = ['dashboard','cr','sig','equilibre','objectifs','bilan','ratios','budget','tresorerie']

interface TopBarProps {
  allMonths: string[]
  onMenuClick?: () => void
  onSidebarToggle?: () => void
  sidebarCollapsed?: boolean
}

export function TopBar({ allMonths, onMenuClick, onSidebarToggle, sidebarCollapsed }: TopBarProps) {
  const tab         = useAppStore(s => s.tab)
  const filters     = useAppStore(s => s.filters)
  const setFilters  = useAppStore(s => s.setFilters)
  const budVersions = useAppStore(s => s.budVersions)
  const RAW         = useAppStore(s => s.RAW)

  const meta       = TAB_META[tab] || { label: tab, icon: '📊' }
  const isAnalysis = ANALYSIS_TABS.includes(tab)
  const isPL       = PL_TABS.includes(tab)

  const selSt: React.CSSProperties = {
    background:'transparent', border:'none', color:'var(--text-0)',
    fontSize:12, fontWeight:500, cursor:'pointer', outline:'none', fontFamily:'inherit',
    padding:'4px 8px', minWidth:'140px',
  }

  const Toggle = ({ label, k }: { label: string; k: 'showMonths' | 'showN1Full' | 'excludeOD' | 'showBudget' }) => {
    const on = filters[k] as boolean
    return (
      <button onClick={() => setFilters({ [k]: !on })} style={{
        padding:'5px 11px', borderRadius:'var(--radius-sm)', fontSize:11.5, fontWeight:600,
        border:'none', cursor:'pointer', transition:'all 0.12s',
        background: on ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
        color:      on ? '#93c5fd' : 'var(--text-2)',
        boxShadow:  on ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'inset 0 0 0 1px var(--border-1)',
      }}>
        {label}
      </button>
    )
  }

  return (
    <header className="topbar-inner" style={{
      minHeight:54, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 24px', gap:16,
      background:'rgba(6,11,20,0.96)', backdropFilter:'blur(20px)',
      borderBottom:'1px solid var(--border-0)', position:'sticky', top:0, zIndex:10,
    }}>

      {/* Hamburger mobile */}
      <button onClick={onMenuClick} className="mobile-menu-btn" style={{
        display:'none', alignItems:'center', justifyContent:'center',
        width:36, height:36, minHeight:36, borderRadius:'var(--radius-sm)',
        background:'rgba(255,255,255,0.05)', border:'1px solid var(--border-1)',
        color:'var(--text-1)', cursor:'pointer', flexShrink:0, fontSize:16,
      }}>☰</button>
      {/* Toggle sidebar desktop */}
      <button onClick={onSidebarToggle} className="desktop-sidebar-btn" style={{
        alignItems:'center', justifyContent:'center',
        width:32, height:32, minHeight:32, borderRadius:'var(--radius-sm)',
        background:'rgba(255,255,255,0.04)', border:'1px solid var(--border-1)',
        color:'var(--text-2)', cursor:'pointer', flexShrink:0, fontSize:13,
        transition:'background 0.15s',
      }} title={sidebarCollapsed ? 'Afficher le menu' : 'Masquer le menu'}>
        {sidebarCollapsed ? '▶' : '◀'}
      </button>

      {/* Titre */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
        <div style={{ width:30, height:30, minHeight:30, borderRadius:'var(--radius-sm)', background:'rgba(59,130,246,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>
          {meta.icon}
        </div>
        <span style={{ fontSize:15, fontWeight:700, color:'var(--text-0)', letterSpacing:'-0.2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {meta.label}
        </span>
      </div>

      {/* Filtres — scrollables sur mobile */}
      <div className="topbar-filters" style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', flexShrink:0 }}>

        {/* Période */}
        {isAnalysis && (
          <div style={{
            display:'flex', alignItems:'center', gap:6, padding:'5px 12px',
            background:'var(--bg-2)', borderRadius:'var(--radius-md)',
            border:'1px solid var(--border-1)',
          }}>
            <span style={{ fontSize:12, opacity:0.4 }}>📅</span>
            {allMonths.length > 0 ? (
              <>
                <select value={filters.startM} onChange={e => setFilters({ startM: e.target.value })} style={selSt}>
                  {allMonths.map(m => {
                    // Tag basé sur l'appartenance aux sets RAW (classés par exercice fiscal
                    // dans buildRAW) — fiable pour les exercices décalés (oct→sep) comme civils.
                    const tag = RAW?.mn?.includes(m) ? ' ·N' : RAW?.m1?.includes(m) ? ' ·N-1' : RAW?.m2?.includes(m) ? ' ·N-2' : ''
                    return <option key={m} value={m} style={{ background:'#0d1424' }}>
                      {monthLabel(m)}{tag}
                    </option>
                  })}
                </select>
                <span style={{ color:'var(--text-3)', fontSize:12 }}>→</span>
                <select value={filters.endM} onChange={e => setFilters({ endM: e.target.value })} style={selSt}>
                  {allMonths.filter(m => monthIdx(m) >= monthIdx(filters.startM)).map(m => {
                    // Tag basé sur l'appartenance aux sets RAW (classés par exercice fiscal
                    // dans buildRAW) — fiable pour les exercices décalés (oct→sep) comme civils.
                    const tag = RAW?.mn?.includes(m) ? ' ·N' : RAW?.m1?.includes(m) ? ' ·N-1' : RAW?.m2?.includes(m) ? ' ·N-2' : ''
                    return <option key={m} value={m} style={{ background:'#0d1424' }}>
                      {monthLabel(m)}{tag}
                    </option>
                  })}
                </select>
              </>
            ) : (
              <span style={{ fontSize:11, color:'var(--text-3)' }}>Importez un FEC</span>
            )}
          </div>
        )}

        {/* Toggles P&L */}
        {isPL && (
          <div style={{ display:'flex', gap:5 }}>
            <Toggle label="Mois"    k="showMonths" />
            <Toggle label="N-1"     k="showN1Full" />
            <Toggle label="Hors OD" k="excludeOD"  />
          </div>
        )}
        {isAnalysis && (
          <Toggle label="Budget" k="showBudget" />
        )}
        {isAnalysis && filters.showBudget && budVersions.length > 0 && (
          <select
            value={filters.budVersionKey}
            onChange={e => setFilters({ budVersionKey: e.target.value })}
            title="Version de budget appliquée à toutes les pages d'analyse"
            style={{
              padding:'5px 8px', borderRadius:6, border:'1px solid var(--border-1)',
              background:'var(--bg-0)', color:'var(--text-1)', fontSize:11,
              cursor:'pointer', fontFamily:'inherit', outline:'none', maxWidth:200,
            }}>
            <option value="">— Version active —</option>
            {budVersions.map(v => (
              <option key={`${v.company_key}|||${v.version_name}`}
                      value={`${v.company_key}|||${v.version_name}`}
                      style={{ background:'#0d1424' }}>
                {v.company_key} — {v.version_name}
              </option>
            ))}
          </select>
        )}
      </div>
    </header>
  )
}



