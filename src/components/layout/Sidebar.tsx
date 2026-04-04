import { useAppStore, useRAW } from '@/store'
import { getCoColor } from '@/lib/calc'
import type { NavItem, TabId } from '@/types'

const NAV: NavItem[] = [
  { id: 'saisie',         label: 'Saisie',          icon: '📝', group: 'ops'     },
  { id: 'equilibre',      label: 'Équilibre',        icon: '⚖️', group: 'ops'     },
  { id: 'tresorerie',     label: 'Trésorerie',       icon: '💧', group: 'ops'     },
  { id: 'budget',         label: 'Budget',           icon: '💰', group: 'ops'     },
  { id: 'objectifs',      label: 'Objectifs',        icon: '🎯', group: 'ops'     },
  { id: 'sig',            label: 'SIG',              icon: '📊', group: 'analyse' },
  { id: 'cr',             label: 'Compte résultat',  icon: '📋', group: 'analyse' },
  { id: 'bilan',          label: 'Bilan',            icon: '🏦', group: 'analyse' },
  { id: 'ratios',         label: 'Ratios',           icon: '📐', group: 'analyse' },
  { id: 'import',         label: 'Import',           icon: '📁', group: 'admin'   },
  { id: 'verification',   label: 'Vérification',     icon: '🔍', group: 'admin'   },
  { id: 'complementaire', label: 'Complémentaire',   icon: '📈', group: 'admin'   },
  { id: 'aide',           label: 'Aide',             icon: '❓', group: 'aide'    },
]

const GROUP_LABELS: Record<string, string> = {
  ops: 'Opérationnel', analyse: 'Analyse', admin: 'Admin', aide: '',
}

export function Sidebar() {
  const tab        = useAppStore(s => s.tab)
  const setTab     = useAppStore(s => s.setTab)
  const filters    = useAppStore(s => s.filters)
  const setFilters = useAppStore(s => s.setFilters)
  const RAW        = useRAW()
  const user       = useAppStore(s => s.user)

  const coLabel = filters.selCo.length === 1
    ? (RAW?.companies[filters.selCo[0]]?.name || filters.selCo[0]).slice(0, 18)
    : filters.selCo.length > 1 ? 'Groupe' : '—'

  return (
    <aside className="w-[232px] min-w-[232px] h-screen sticky top-0 flex flex-col overflow-y-auto"
      style={{ background: '#0a0f1a', borderRight: '1px solid rgba(255,255,255,0.04)' }}>

      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
            📊
          </div>
          <div className="text-sm font-extrabold text-white tracking-tight">
            <span className="text-brand-blue">adam</span>boards
          </div>
        </div>

        {/* Carte société */}
        <div className="rounded-lg p-2.5 text-xs"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="font-semibold text-white/90 mb-0.5">{coLabel}</div>
          <div className="text-muted truncate">{user?.email}</div>

          {RAW?.keys && RAW.keys.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {RAW.keys.map(k => {
                const active = filters.selCo.includes(k)
                const color  = getCoColor(k)
                return (
                  <button
                    key={k}
                    onClick={() => {
                      const next = active
                        ? filters.selCo.filter(x => x !== k)
                        : [...filters.selCo, k]
                      setFilters({ selCo: next })
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                    style={{
                      background: active ? `${color}25` : 'rgba(255,255,255,0.04)',
                      color: active ? color : '#475569',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {(RAW.companies[k]?.name || k).slice(0, 12).replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-1">
        {(() => {
          let lastGroup: string | null = null
          return NAV.map(item => {
            const active = tab === item.id
            const showGroup = item.group !== lastGroup && GROUP_LABELS[item.group]
            if (showGroup) lastGroup = item.group

            return (
              <div key={item.id}>
                {showGroup && (
                  <div className="px-2.5 pt-3.5 pb-1 text-[9.5px] font-bold tracking-[0.9px] uppercase"
                    style={{ color: '#334155' }}>
                    {GROUP_LABELS[item.group]}
                  </div>
                )}
                <button
                  onClick={() => setTab(item.id as TabId)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 text-left transition-all"
                  style={{
                    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: active ? '#f1f5f9' : '#64748b',
                    fontWeight: active ? 600 : 400,
                    fontSize: 12.5,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: active ? 'inset 0 0 0 1px rgba(59,130,246,0.25)' : 'none',
                  }}
                >
                  <span className="w-6.5 h-6.5 rounded-md flex items-center justify-center text-[13px] flex-shrink-0"
                    style={{ background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              </div>
            )
          })
        })()}
      </nav>

      {/* Footer — TEST en dur */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        {RAW?.mn && RAW.mn.length > 0 && (
          <div className="text-[10px] text-[#334155] mb-1">
            <span className="text-[#475569]">N</span>{' '}
            {RAW.mn[0]?.slice(0, 7)} → {RAW.mn[RAW.mn.length - 1]?.slice(0, 7)}
          </div>
        )}
        {RAW?.m1 && RAW.m1.length > 0 && (
          <div className="text-[10px] text-[#334155] mb-2">
            <span className="text-[#475569]">N-1</span>{' '}
            {RAW.m1[0]?.slice(0, 7)} → {RAW.m1[RAW.m1.length - 1]?.slice(0, 7)}
          </div>
        )}
        <span className="inline-block px-2 py-0.5 rounded-full text-[9.5px] font-bold tracking-wide"
          style={{
            background: 'rgba(245,158,11,0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245,158,11,0.2)',
          }}>
          ● TEST
        </span>
      </div>
    </aside>
  )
}
