import { describe, it, expect } from 'vitest'
import {
  normalizeRole, isSuperadmin,
  canAccessTab, canWrite,
  roleLabel, roleColor,
} from '@/lib/roles'

describe('normalizeRole', () => {
  it('returns canonical roles unchanged', () => {
    expect(normalizeRole('superadmin')).toBe('superadmin')
    expect(normalizeRole('admin')).toBe('admin')
    expect(normalizeRole('comptable')).toBe('comptable')
    expect(normalizeRole('viewer')).toBe('viewer')
  })
  it('accepts case variations', () => {
    expect(normalizeRole('Admin')).toBe('admin')
    expect(normalizeRole('SUPERADMIN')).toBe('superadmin')
    expect(normalizeRole('VIEWER')).toBe('viewer')
  })
  it('accepts separator variations (the bug we hit in prod)', () => {
    expect(normalizeRole('super_admin')).toBe('superadmin')
    expect(normalizeRole('super-admin')).toBe('superadmin')
    expect(normalizeRole('Super Admin')).toBe('superadmin')
    expect(normalizeRole('SUPER-ADMIN')).toBe('superadmin')
  })
  it('falls back to viewer for unknown / null / empty', () => {
    expect(normalizeRole('')).toBe('viewer')
    expect(normalizeRole(null)).toBe('viewer')
    expect(normalizeRole(undefined)).toBe('viewer')
    expect(normalizeRole('owner')).toBe('viewer')
    expect(normalizeRole('root')).toBe('viewer')
  })
})

describe('isSuperadmin', () => {
  it('detects all superadmin variants', () => {
    expect(isSuperadmin('superadmin')).toBe(true)
    expect(isSuperadmin('SUPER_ADMIN')).toBe(true)
    expect(isSuperadmin('Super-Admin')).toBe(true)
  })
  it('rejects non-superadmin roles', () => {
    expect(isSuperadmin('admin')).toBe(false)
    expect(isSuperadmin('comptable')).toBe(false)
    expect(isSuperadmin('viewer')).toBe(false)
    expect(isSuperadmin(null)).toBe(false)
  })
})

describe('canAccessTab', () => {
  it('superadmin and admin can access everything', () => {
    expect(canAccessTab('superadmin', 'dashboard')).toBe(true)
    expect(canAccessTab('superadmin', 'import')).toBe(true)
    expect(canAccessTab('admin', 'verification')).toBe(true)
  })
  it('comptable cannot access admin-only tabs', () => {
    expect(canAccessTab('comptable', 'import')).toBe(false)
    expect(canAccessTab('comptable', 'verification')).toBe(false)
  })
  it('comptable can write to operational tabs', () => {
    expect(canAccessTab('comptable', 'saisie')).toBe(true)
    expect(canAccessTab('comptable', 'budget')).toBe(true)
    expect(canAccessTab('comptable', 'tresorerie')).toBe(true)
  })
  it('viewer can only access analysis tabs', () => {
    expect(canAccessTab('viewer', 'dashboard')).toBe(true)
    expect(canAccessTab('viewer', 'cr')).toBe(true)
    expect(canAccessTab('viewer', 'bilan')).toBe(true)
    expect(canAccessTab('viewer', 'saisie')).toBe(false)
    expect(canAccessTab('viewer', 'budget')).toBe(false)
    expect(canAccessTab('viewer', 'import')).toBe(false)
  })
  it('works with non-canonical role strings via normalization', () => {
    expect(canAccessTab('super_admin', 'dashboard')).toBe(true)
    expect(canAccessTab('Comptable', 'saisie')).toBe(true)
  })
})

describe('canWrite', () => {
  it('superadmin / admin / comptable can write', () => {
    expect(canWrite('superadmin')).toBe(true)
    expect(canWrite('admin')).toBe(true)
    expect(canWrite('comptable')).toBe(true)
  })
  it('viewer cannot write', () => {
    expect(canWrite('viewer')).toBe(false)
  })
  it('unknown roles fall back to viewer (cannot write)', () => {
    expect(canWrite('unknown')).toBe(false)
    expect(canWrite('')).toBe(false)
  })
})

describe('roleLabel', () => {
  it('returns French labels for canonical roles', () => {
    expect(roleLabel('superadmin')).toBe('Super-admin')
    expect(roleLabel('admin')).toBe('Administrateur')
    expect(roleLabel('comptable')).toBe('Comptable')
    expect(roleLabel('viewer')).toBe('Consultation')
  })
  it('handles separator variants', () => {
    expect(roleLabel('super_admin')).toBe('Super-admin')
    expect(roleLabel('SUPERADMIN')).toBe('Super-admin')
  })
})

describe('roleColor', () => {
  it('returns distinct hex colors per role', () => {
    const colors = ['superadmin', 'admin', 'comptable', 'viewer'].map(roleColor)
    expect(new Set(colors).size).toBe(4)
    colors.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i))
  })
})
