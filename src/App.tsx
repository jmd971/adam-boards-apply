import { useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sb, getUserRole } from '@/lib/supabase'
import { useAppStore } from '@/store'
import { Sidebar }        from '@/components/layout/Sidebar'
import { TopBar }         from '@/components/layout/TopBar'
import { Spinner }        from '@/components/ui'
import { LoginPage }      from '@/modules/auth/LoginPage'
import { CompteResultat } from '@/modules/cr/CompteResultat'
import { Sig }            from '@/modules/sig/Sig'
import { Import }         from '@/modules/import/Import'
import { Placeholder }    from '@/modules/_placeholder'
import { useCompanyData } from '@/hooks/useCompanyData'
import type { User }      from '@supabase/supabase-js'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } }
})

function AppInner() {
  const user         = useAppStore(s => s.user)
  const setUser      = useAppStore(s => s.setUser)
  const setRole      = useAppStore(s => s.setRole)
  const dataLoading  = useAppStore(s => s.dataLoading)
  const RAW          = useAppStore(s => s.RAW)
  const tab          = useAppStore(s => s.tab)

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

  useCompanyData()

  const allMonths = useMemo(() => {
    const ms = new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? [])])
    return [...ms].sort()
  }, [RAW?.mn?.join(), RAW?.m1?.join()])

  if (!user) {
    return <LoginPage onLogin={(u: User) => {
      setUser(u)
      getUserRole(u.id).then(setRole)
    }} />
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: '#080d1a', color: '#f1f5f9' }}>
        <Spinner size={36} />
        <div className="text-sm text-muted">Connexion à la base de données...</div>
      </div>
    )
  }

  const TabContent = () => {
    switch (tab) {
      case 'cr':             return <CompteResultat />
      case 'sig':            return <Sig />
      case 'import':         return <Import />
      case 'equilibre':      return <Placeholder icon="⚖️"  label="Équilibre financier"      description="Module en cours de développement — Phase 2" />
      case 'objectifs':      return <Placeholder icon="🎯"  label="Objectifs commerciaux"    description="Module en cours de développement — Phase 2" />
      case 'bilan':          return <Placeholder icon="🏦"  label="Bilan comptable"           description="Module en cours de développement — Phase 2" />
      case 'ratios':         return <Placeholder icon="📐"  label="Ratios financiers"         description="Module en cours de développement — Phase 2" />
      case 'budget':         return <Placeholder icon="💰"  label="Budget prévisionnel"       description="Module en cours de développement — Phase 2" />
      case 'saisie':         return <Placeholder icon="📝"  label="Saisie manuelle"           description="Module en cours de développement — Phase 2" />
      case 'verification':   return <Placeholder icon="🔍"  label="Vérification"              description="Module en cours de développement — Phase 3" />
      case 'complementaire': return <Placeholder icon="📈"  label="Analyse complémentaire"    description="Module en cours de développement — Phase 3" />
      case 'tresorerie':     return <Placeholder icon="💧"  label="Trésorerie prévisionnelle" description="Module en cours de développement — Phase 2" />
      case 'aide':           return <Placeholder icon="❓"  label="Aide & documentation"      description="Documentation en cours de rédaction" />
      default:               return null
    }
  }

  return (
    <div className="flex min-h-screen"
      style={{ background: '#080d1a', color: '#f1f5f9', fontFamily: 'Outfit, Inter, sans-serif' }}>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar allMonths={allMonths} />
        <main className="flex-1 overflow-y-auto">
          {RAW && RAW.keys.length === 0 && tab !== 'import' ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-8">
              <div className="text-4xl">📁</div>
              <div>
                <div className="text-base font-bold text-white mb-1">Aucune donnée disponible</div>
                <div className="text-xs text-muted max-w-xs">
                  Importez un fichier FEC depuis l'onglet Import pour commencer.
                </div>
              </div>
            </div>
          ) : (
            <TabContent />
          )}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
