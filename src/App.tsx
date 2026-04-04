import { useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sb, getUserRole } from '@/lib/supabase'
import { useAppStore } from '@/store'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar }  from '@/components/layout/TopBar'
import { Spinner } from '@/components/ui'
import { LoginPage }       from '@/modules/auth/LoginPage'
import { CompteResultat }  from '@/modules/cr/CompteResultat'
import { Sig }             from '@/modules/sig/Sig'
import { Import }          from '@/modules/import/Import'
import { Placeholder }     from '@/modules/_placeholder'
import { useCompanyData }  from '@/hooks/useCompanyData'
import type { User } from '@supabase/supabase-js'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } }
})

// ─── Composant interne (a accès au QueryClient) ────────────────────────────

function AppInner() {
  const { user, setUser, setRole, dataLoading, RAW, tab, setFilters } = useAppStore(s => ({
    user: s.user, setUser: s.setUser, setRole: s.setRole,
    dataLoading: s.dataLoading, RAW: s.RAW, tab: s.tab,
    setFilters: s.setFilters,
  }))

  // Vérifier session au démarrage
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user)
        getUserRole(data.session.user.id).then(setRole)
      }
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session?.user) getUserRole(session.user.id).then(setRole)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Charger données si connecté
  useCompanyData()

  // Initialiser la période par défaut
  useEffect(() => {
    if (!RAW?.mn?.length) return
    setFilters({ startM: RAW.mn[0], endM: RAW.mn[RAW.mn.length - 1] })
  }, [RAW?.mn?.join()])

  // Tous les mois disponibles
  const allMonths = useMemo(() => {
    const ms = new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])
    return [...ms].sort()
  }, [RAW?.mn?.join(), RAW?.m1?.join()])

  // ── Login ──────────────────────────────────────────────────────────────
  if (!user) {
    return <LoginPage onLogin={(u: User) => {
      setUser(u)
      getUserRole(u.id).then(setRole)
    }} />
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: '#080d1a', color: '#f1f5f9' }}>
        <Spinner size={36} />
        <div className="text-sm text-muted">Chargement des données...</div>
      </div>
    )
  }

  // ── Tab content ────────────────────────────────────────────────────────
  const TabContent = () => {
    switch (tab) {
      case 'cr':             return <CompteResultat />
      case 'sig':            return <Sig />
      case 'equilibre':      return <Placeholder icon="⚖️" label="Équilibre financier" />
      case 'objectifs':      return <Placeholder icon="🎯" label="Objectifs commerciaux" />
      case 'bilan':          return <Placeholder icon="🏦" label="Bilan comptable" />
      case 'ratios':         return <Placeholder icon="📐" label="Ratios financiers" />
      case 'import':         return <Import />
      case 'budget':         return <Placeholder icon="💰" label="Budget prévisionnel" />
      case 'saisie':         return <Placeholder icon="📝" label="Saisie manuelle" />
      case 'verification':   return <Placeholder icon="🔍" label="Vérification" />
      case 'complementaire': return <Placeholder icon="📈" label="Analyse complémentaire" />
      case 'tresorerie':     return <Placeholder icon="💧" label="Trésorerie prévisionnelle" />
      case 'aide':           return <Placeholder icon="❓" label="Aide & documentation" />
      default:               return null
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen" style={{ background: '#080d1a', color: '#f1f5f9', fontFamily: 'Outfit, Inter, sans-serif' }}>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar allMonths={allMonths} />
        <main className="flex-1 overflow-y-auto">
          <TabContent />
        </main>
      </div>
    </div>
  )
}

// ─── Root avec providers ───────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
