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

interface TopBarProps {
  allMonths: string[]
}

export function TopBar({ allMonths }: TopBarProps) {
  const tab     = useAppStore(s => s.tab)
  const filters = useAppStore(s => s.filters)
  const RAW     = useAppStore(s => s.RAW)
  const setFilters = useAppStore(s => s.setFilters)

  const isAnalysis = ANALYSIS_TABS.includes(tab)
  const isPL       = ['cr', 'sig', 'equilibre'].includes(tab)

  const Toggle = ({ label, stateKey }: { label: string; stateKey: keyof typeof filters }) => (
    <button
      onClick={() => setFilters({ [stateKey]: !filters[stateKey] })}
      className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
      style={{
        background: filters[stateKey] ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
        color:      filters[stateKey] ? '#93c5fd' : '#64748b',
        border:     'none',
        cursor:     'pointer',
        boxShadow:  filters[stateKey]
          ? 'inset 0 0 0 1px rgba(59,130,246,0.35)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      {label}
    </button>
  )

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

  return (
    <div
      className="sticky top-0 z-10 flex items-center justify-between gap-3 flex-wrap"
      style={{
        padding: '0 24px',
        height: 52,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(10,15,26,0.98)',
        backdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}
    >
      {/* Titre */}
      <div className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ background: 'rgba(59,130,246,0.15)' }}>
          {TAB_ICONS[tab] || '📊'}
        </div>
        <span className="text-sm font-bold text-white tracking-tight">
          {TAB_LABELS[tab] || tab}
        </span>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Sélecteurs de période */}
        {isAnalysis && allMonths.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-xs opacity-50">📅</span>
            <select
              value={filters.startM}
              onChange={e => setFilters({ startM: e.target.value })}
              style={selectStyle}
            >
              {allMonths.map(m => {
                const inN  = RAW?.mn?.includes(m)
                const inN1 = RAW?.m1?.includes(m)
                return (
                  <option key={m} value={m} style={{ background: '#0f172a' }}>
                    {monthLabel(m)}{inN ? ' ·N' : inN1 ? ' ·N-1' : ''}
                  </option>
                )
              })}
            </select>
            <span className="text-[#334155] text-xs">→</span>
            <select
              value={filters.endM}
              onChange={e => setFilters({ endM: e.target.value })}
              style={selectStyle}
            >
              {allMonths
                .filter(m => monthIdx(m) >= monthIdx(filters.startM))
                .map(m => {
                  const inN  = RAW?.mn?.includes(m)
                  const inN1 = RAW?.m1?.includes(m)
                  return (
                    <option key={m} value={m} style={{ background: '#0f172a' }}>
                      {monthLabel(m)}{inN ? ' ·N' : inN1 ? ' ·N-1' : ''}
                    </option>
                  )
                })}
            </select>
          </div>
        )}

        {isPL && (
          <div className="flex items-center gap-1.5">
            <Toggle label="Mois"     stateKey="showMonths" />
            <Toggle label="N-1"      stateKey="showN1Full" />
            <Toggle label="Hors OD"  stateKey="excludeOD"  />
          </div>
        )}
      </div>
    </div>
  )
}
