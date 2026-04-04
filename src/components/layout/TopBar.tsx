import { useAppStore } from '@/store'
import { monthIdx, monthLabel } from '@/lib/calc'

const TAB_LABELS: Record<string, string> = {
  cr: 'Compte résultat', sig: 'SIG', equilibre: 'Équilibre',
  objectifs: 'Objectifs', bilan: 'Bilan', ratios: 'Ratios',
  import: 'Import FEC', budget: 'Budget', saisie: 'Saisie',
  verification: 'Vérification', complementaire: 'Complémentaire',
  tresorerie: 'Trésorerie', aide: 'Aide',
}

const TAB_ICONS: Record<string, string> = {
  cr: '📋', sig: '📊', equilibre: '⚖️', objectifs: '🎯',
  bilan: '🏦', ratios: '📐', import: '📁', budget: '💰',
  saisie: '📝', verification: '🔍', complementaire: '📈',
  tresorerie: '💧', aide: '❓',
}

const ANALYSIS_TABS = ['cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios', 'budget']
const PL_TABS       = ['cr', 'sig', 'equilibre']

interface TopBarProps { allMonths: string[] }

export function TopBar({ allMonths }: TopBarProps) {
  const tab        = useAppStore(s => s.tab)
  const filters    = useAppStore(s => s.filters)
  const RAW        = useAppStore(s => s.RAW)
  const setFilters = useAppStore(s => s.setFilters)

  const isAnalysis = ANALYSIS_TABS.includes(tab)
  const isPL       = PL_TABS.includes(tab)

  const selectStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
  }

  const Toggle = ({ label, stateKey }: { label: string; stateKey: 'showMonths' | 'showN1Full' | 'excludeOD' }) => (
    <button
      onClick={() => setFilters({ [stateKey]: !filters[stateKey] })}
      style={{
        padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
        background: filters[stateKey] ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
        color:      filters[stateKey] ? '#93c5fd' : '#64748b',
        boxShadow:  filters[stateKey]
          ? 'inset 0 0 0 1px rgba(59,130,246,0.35)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{
      padding: '0 24px', height: 52, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(10,15,26,0.98)',
      position: 'sticky', top: 0, zIndex: 10,
      backdropFilter: 'blur(20px)',
    }}>

      {/* Titre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, fontSize: 15,
          background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {TAB_ICONS[tab] || '📊'}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.2px' }}>
          {TAB_LABELS[tab] || tab}
        </span>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Sélecteurs de période — toujours visibles sur les onglets analyse */}
        {isAnalysis && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            borderRadius: 8, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>📅</span>

            {allMonths.length > 0 ? (
              <>
                <select value={filters.startM} onChange={e => setFilters({ startM: e.target.value })} style={selectStyle}>
                  {allMonths.map(m => {
                    const inN = RAW?.mn?.includes(m), inN1 = RAW?.m1?.includes(m)
                    return <option key={m} value={m} style={{ background: '#0f172a' }}>
                      {monthLabel(m)}{inN ? ' ·N' : inN1 ? ' ·N-1' : ''}
                    </option>
                  })}
                </select>
                <span style={{ color: '#334155', fontSize: 12 }}>→</span>
                <select value={filters.endM} onChange={e => setFilters({ endM: e.target.value })} style={selectStyle}>
                  {allMonths.filter(m => monthIdx(m) >= monthIdx(filters.startM)).map(m => {
                    const inN = RAW?.mn?.includes(m), inN1 = RAW?.m1?.includes(m)
                    return <option key={m} value={m} style={{ background: '#0f172a' }}>
                      {monthLabel(m)}{inN ? ' ·N' : inN1 ? ' ·N-1' : ''}
                    </option>
                  })}
                </select>
              </>
            ) : (
              <span style={{ fontSize: 11, color: '#475569' }}>Aucune donnée — importez un FEC</span>
            )}
          </div>
        )}

        {/* Toggles */}
        {isPL && (
          <div style={{ display: 'flex', gap: 6 }}>
            <Toggle label="Mois"    stateKey="showMonths" />
            <Toggle label="N-1"     stateKey="showN1Full" />
            <Toggle label="Hors OD" stateKey="excludeOD"  />
          </div>
        )}
      </div>
    </div>
  )
}
