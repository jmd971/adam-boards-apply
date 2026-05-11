import type { TabId } from '@/types'

export type Role = 'superadmin' | 'admin' | 'comptable' | 'viewer'

const ADMIN_TABS: TabId[] = [
  'dashboard', 'cr', 'sig', 'equilibre', 'objectifs', 'bilan', 'ratios',
  'import', 'budget', 'saisie', 'tresorerie', 'verification', 'creances',
  'complementaire', 'rapprochement', 'depot', 'aide', 'ventes',
]

/** Tabs accessible per role */
const ROLE_TABS: Record<Role, TabId[]> = {
  // superadmin = accès à tout, comme admin (réservé aux dev / support)
  superadmin: ADMIN_TABS,
  admin:      ADMIN_TABS,
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
const ROLE_CAN_WRITE: Record<Role, boolean> = {
  superadmin: true,
  admin:      true,
  comptable:  true,
  viewer:     false,
}

/**
 * Normalise un rôle (défensif) : accepte les variantes super_admin, SUPER-ADMIN, etc.
 * Même logique que supabase.ts:normalizeRole.
 */
function norm(role: string): Role {
  const n = (role ?? '').toLowerCase().trim().replace(/[_\s-]+/g, '')
  if (n === 'superadmin' || n === 'admin' || n === 'comptable' || n === 'viewer') return n as Role
  return 'viewer'
}

export function canAccessTab(role: Role | string, tab: TabId): boolean {
  return ROLE_TABS[norm(role as string)]?.includes(tab) ?? false
}

export function canWrite(role: Role | string): boolean {
  return ROLE_CAN_WRITE[norm(role as string)] ?? false
}

export function roleLabel(role: Role | string): string {
  switch (norm(role as string)) {
    case 'superadmin': return 'Super-admin'
    case 'admin':      return 'Administrateur'
    case 'comptable':  return 'Comptable'
    case 'viewer':     return 'Consultation'
    default:           return String(role)
  }
}

export function roleColor(role: Role | string): string {
  switch (norm(role as string)) {
    case 'superadmin': return '#f59e0b'
    case 'admin':      return '#ef4444'
    case 'comptable':  return '#3b82f6'
    case 'viewer':     return '#64748b'
    default:           return '#64748b'
  }
}
