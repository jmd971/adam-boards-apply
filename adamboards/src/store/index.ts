import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import type { RAWData, TabId, ManualEntry, FilterState } from '@/types'

// ─── Auth slice ────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null
  role: string
  setUser: (user: User | null) => void
  setRole: (role: string) => void
}

// ─── Data slice ────────────────────────────────────────────────────────────

interface DataState {
  RAW: RAWData | null
  manualEntries: ManualEntry[]
  budData: Record<string, Record<string, { b: number[]; t: string; l: string }>>
  budStatus: Record<string, string>
  dataLoading: boolean
  setRAW: (raw: RAWData | null) => void
  setManualEntries: (entries: ManualEntry[]) => void
  setBudData: (data: DataState['budData']) => void
  setBudStatus: (status: Record<string, string>) => void
  setDataLoading: (loading: boolean) => void
}

// ─── UI / Filter slice ─────────────────────────────────────────────────────

interface UIState {
  tab: TabId
  filters: FilterState
  setTab: (tab: TabId) => void
  setFilters: (partial: Partial<FilterState>) => void
}

// ─── Combined store ────────────────────────────────────────────────────────

type AppStore = AuthState & DataState & UIState

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      role: 'viewer',
      setUser: (user) => set({ user }),
      setRole: (role) => set({ role }),

      // Data
      RAW: null,
      manualEntries: [],
      budData: {},
      budStatus: {},
      dataLoading: true,
      setRAW:          (RAW)           => set({ RAW }),
      setManualEntries:(manualEntries) => set({ manualEntries }),
      setBudData:      (budData)       => set({ budData }),
      setBudStatus:    (budStatus)     => set({ budStatus }),
      setDataLoading:  (dataLoading)   => set({ dataLoading }),

      // UI
      tab: 'cr',
      filters: {
        startM: '',
        endM: '',
        showMonths: true,
        showN1Full: false,
        excludeOD: false,
        selCo: [],
        budCo: '',
      },
      setTab: (tab) => set({ tab }),
      setFilters: (partial) =>
        set(state => ({ filters: { ...state.filters, ...partial } })),
    }),
    {
      name: 'adamboards-store',
      partialize: (s) => ({
        filters: {
          showMonths: s.filters.showMonths,
          showN1Full: s.filters.showN1Full,
          excludeOD:  s.filters.excludeOD,
          selCo:      s.filters.selCo,
          budCo:      s.filters.budCo,
        },
      }),
    }
  )
)

// Sélecteurs typés
export const useUser    = () => useAppStore(s => s.user)
export const useRole    = () => useAppStore(s => s.role)
export const useRAW     = () => useAppStore(s => s.RAW)
export const useFilters = () => useAppStore(s => s.filters)
export const useTab     = () => useAppStore(s => s.tab)
