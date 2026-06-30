import type { TabId } from '@/types'

export type Role = 'superadmin' | 'admin' | 'comptable' | 'viewer'

const ADMIN_TABS: TabId[] = [
  'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios', 'tva',
  'import', 'budget', 'saisie', 'tresorerie', 'verification', 'creances', 'dettes',
  'complementaire', 'rapprochement', 'depot', 'aide', 'ventes', 'parametres', 'rapport', 'conseiller',
]

/** Tabs accessible per role */
const ROLE_TABS: Record<Role, TabId[]> = {
  // superadmin = accès à tout, comme admin (réservé aux dev / support)
  superadmin: ADMIN_TABS,
  admin:      ADMIN_TABS,
  comptable: [
    'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios', 'tva',
    'budget', 'saisie', 'tresorerie', 'creances', 'dettes', 'complementaire',
    'rapprochement', 'depot', 'aide', 'ventes', 'rapport',
  ],
  viewer: [
    'dashboard', 'cr', 'sig', 'equilibre', 'bilan', 'ratios', 'tva',
    'complementaire', 'dettes', 'aide', 'ventes',
  ],
}

/** Whether a role can write (create/edit/delete data) */
const ROLE_CAN_WRITE: Record<Role, boolean> = {
  superadmin: true,
  admin:      true,
  comptable:  true,
  viewer:     false,
}

/** Normalise un rôle brut (DB ou input externe) : "Super_Admin" → "superadmin", "SUPER-ADMIN" → "superadmin"… */
export function normalizeRole(role: string | null | undefined): Role {
  const n = (role ?? '').toLowerCase().trim().replace(/[_\s-]+/g, '')
  if (n === 'superadmin' || n === 'admin' || n === 'comptable' || n === 'viewer') return n as Role
  return 'viewer'
}

export function isSuperadmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'superadmin'
}

export function canAccessTab(role: Role | string, tab: TabId): boolean {
  return ROLE_TABS[normalizeRole(role)]?.includes(tab) ?? false
}

export function canWrite(role: Role | string): boolean {
  return ROLE_CAN_WRITE[normalizeRole(role)] ?? false
}

export function roleLabel(role: Role | string): string {
  switch (normalizeRole(role)) {
    case 'superadmin': return 'Super-admin'
    case 'admin':      return 'Administrateur'
    case 'comptable':  return 'Comptable'
    case 'viewer':     return 'Consultation'
    default:           return String(role)
  }
}

export function roleColor(role: Role | string): string {
  switch (normalizeRole(role)) {
    case 'superadmin': return '#f59e0b'
    case 'admin':      return '#ef4444'
    case 'comptable':  return '#3b82f6'
    case 'viewer':     return '#64748b'
    default:           return '#64748b'
  }
}
