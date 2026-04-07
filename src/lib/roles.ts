import type { TabId } from '@/types'

export type Role = 'admin' | 'comptable' | 'viewer'

/** Tabs accessible per role */
const ROLE_TABS: Record<Role, TabId[]> = {
  admin: [
    'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios',
    'import', 'budget', 'saisie', 'tresorerie', 'verification', 'creances',
    'complementaire', 'rapprochement', 'aide',
  ],
  comptable: [
    'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios',
    'budget', 'saisie', 'tresorerie', 'creances', 'complementaire',
    'rapprochement', 'aide',
  ],
  viewer: [
    'dashboard', 'cr', 'sig', 'equilibre', 'bilan', 'ratios',
    'complementaire', 'aide',
  ],
}

/** Whether a role can write (create/edit/delete data) */
const ROLE_CAN_WRITE: Record<Role, boolean> = {
  admin: true,
  comptable: true,
  viewer: false,
}

export function canAccessTab(role: Role, tab: TabId): boolean {
  return ROLE_TABS[role]?.includes(tab) ?? false
}

export function canWrite(role: Role): boolean {
  return ROLE_CAN_WRITE[role] ?? false
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'admin':     return 'Administrateur'
    case 'comptable': return 'Comptable'
    case 'viewer':    return 'Consultation'
    default:          return role
  }
}

export function roleColor(role: Role): string {
  switch (role) {
    case 'admin':     return '#ef4444'
    case 'comptable': return '#3b82f6'
    case 'viewer':    return '#64748b'
    default:          return '#64748b'
  }
}
