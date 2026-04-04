import { useAppStore } from '@/store'
import { monthIdx, monthLabel } from '@/lib/calc'

const TAB_META: Record<string, { label: string; icon: string }> = {
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
  aide:           { label:'Aide',                 icon:'❓' },
}

const PL_TABS       = ['cr','sig','equilibre']
const ANALYSIS_TABS = ['cr','sig','equilibre','objectifs','bilan','ratios','budget']

interface TopBarProps { allMonths: string[] }

export function TopBar({ allMonths }: TopBarProps) {
  const tab        = useAppStore(s => s.tab)
  const filters    = useAppStore(s => s.filters)
  const RAW        = useAppStore(s => s.RAW)
  const setFilters = useAppStore(s => s.setFilters)

  const meta       = TAB_META[tab] || { label: tab, icon: '📊' }
  const isAnalysis = ANALYSIS_TABS.includes(tab)
  const isPL       = PL_TABS.includes(tab)

  const selSt: React.CSSProperties = {
    background:'transparent', border:'none', color:'var(--text-0)',
    fontSize:12, fontWeight:500, cursor:'pointer', outline:'none', fontFamily:'inherit',
    padding:'2px 0',
  }

  const Toggle = ({ label, k }: { label: string; k: 'showMonths' | 'showN1Full' | 'excludeOD' }) => {
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
    <header style={{
      height:54, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 24px', gap:16,
      background:'rgba(6,11,20,0.96)', backdropFilter:'blur(20px)',
      borderBottom:'1px solid var(--border-0)', position:'sticky', top:0, zIndex:10,
    }}>

      {/* Titre */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <div style={{ width:30, height:30, borderRadius:'var(--radius-sm)', background:'rgba(59,130,246,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>
          {meta.icon}
        </div>
        <span style={{ fontSize:15, fontWeight:700, color:'var(--text-0)', letterSpacing:'-0.2px' }}>
          {meta.label}
        </span>
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap' }}>

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
                    const inN = RAW?.mn?.includes(m), inN1 = RAW?.m1?.includes(m)
                    return <option key={m} value={m} style={{ background:'#0d1424' }}>
                      {monthLabel(m)}{inN?' ·N':inN1?' ·N-1':''}
                    </option>
                  })}
                </select>
                <span style={{ color:'var(--text-3)', fontSize:12 }}>→</span>
                <select value={filters.endM} onChange={e => setFilters({ endM: e.target.value })} style={selSt}>
                  {allMonths.filter(m => monthIdx(m) >= monthIdx(filters.startM)).map(m => {
                    const inN = RAW?.mn?.includes(m), inN1 = RAW?.m1?.includes(m)
                    return <option key={m} value={m} style={{ background:'#0d1424' }}>
                      {monthLabel(m)}{inN?' ·N':inN1?' ·N-1':''}
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
      </div>
    </header>
  )
}
