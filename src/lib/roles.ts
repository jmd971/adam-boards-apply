import type { TabId } from '@/types'

export type Role = 'admin' | 'comptable' | 'viewer'

const ALL_TABS: TabId[] = [
  'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios',
  'import', 'budget', 'saisie', 'tresorerie', 'verification', 'creances',
  'complementaire', 'rapprochement', 'depot', 'aide', 'ventes', 'souscription',
]

/** Tabs accessible per role */
const ROLE_TABS: Record<string, TabId[]> = {
  admin: ALL_TABS,
  comptable: [
    'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios',
    'budget', 'saisie', 'tresorerie', 'creances', 'complementaire',
    'rapprochement', 'depot', 'aide', 'ventes',
  ],
  viewer: [
    'dashboard', 'cr', 'sig', 'equilibre', 'bilan', 'ratios',
    'complementaire', 'aide', 'ventes',
  ],
}

/** Whether a role can write (create/edit/delete data) */
const ROLE_CAN_WRITE: Record<string, boolean> = {
  admin:     true,
  comptable: true,
  viewer:    false,
}

export function canAccessTab(role: string, tab: TabId): boolean {
  return (ROLE_TABS[role] ?? ROLE_TABS.viewer).includes(tab)
}

export function canWrite(role: string): boolean {
  return ROLE_CAN_WRITE[role] ?? false
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'admin':     return 'Administrateur'
    case 'comptable': return 'Comptable'
    case 'viewer':    return 'Consultation'
    default:          return role
  }
}

export function roleColor(role: string): string {
  switch (role) {
    case 'admin':     return '#ef4444'
    case 'comptable': return '#3b82f6'
    case 'viewer':    return '#64748b'
    default:          return '#64748b'
  }
}
