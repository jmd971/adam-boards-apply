import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sb, getUserRole } from '@/lib/supabase'
import { useAppStore } from '@/store'
import { canAccessTab, type Role } from '@/lib/roles'
import { Sidebar }          from '@/components/layout/Sidebar'
import { TopBar }           from '@/components/layout/TopBar'
import { Spinner, ErrorBoundary } from '@/components/ui'
import { LoginPage }        from '@/modules/auth/LoginPage'
import { CompteResultat }   from '@/modules/cr/CompteResultat'
import { Sig }              from '@/modules/sig/Sig'
import { Dashboard }        from '@/modules/dashboard/Dashboard'
import { Equilibre }        from '@/modules/equilibre/Equilibre'
import { Objectifs }        from '@/modules/objectifs/Objectifs'
import { Bilan }            from '@/modules/bilan/Bilan'
import { Ratios }           from '@/modules/ratios/Ratios'
import { Import }           from '@/modules/import/Import'
import { Budget }           from '@/modules/budget/Budget'
import { Saisie }           from '@/modules/saisie/Saisie'
import { Tresorerie }       from '@/modules/tresorerie/Tresorerie'
import { Verification }     from '@/modules/verification/Verification'
import { Creances }         from '@/modules/creances/Creances'
import { Complementaire }   from '@/modules/complementaire/Complementaire'
import { Aide }             from '@/modules/aide/Aide'
import { useCompanyData }   from '@/hooks/useCompanyData'
import type { User }        from '@supabase/supabase-js'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } }
})

function AppInner() {
  const user        = useAppStore(s => s.user)
  const setUser     = useAppStore(s => s.setUser)
  const role        = useAppStore(s => s.role) as Role
  const setRole     = useAppStore(s => s.setRole)
  const dataLoading = useAppStore(s => s.dataLoading)
  const RAW         = useAppStore(s => s.RAW)
  const tab         = useAppStore(s => s.tab)
  const setTab      = useAppStore(s => s.setTab)

  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    // Gérer le callback OAuth/magic link (hash dans l'URL après redirect Supabase)
    const hash = window.location.hash
    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      if (hash.includes('error')) {
        console.warn('[Auth] OAuth error dans l\'URL — ignoré, retour au login')
      }
      // Nettoyer l'URL sans recharger la page
      window.history.replaceState(null, '', window.location.pathname)
    }

    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user)
        getUserRole(data.session.user.id).then(setRole)
      }
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null)
        if (session?.user) getUserRole(session.user.id).then(setRole)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Fermer le nav mobile lors du changement d'onglet (avec vérification rôle)
  const handleTabChange = (t: any) => {
    if (canAccessTab(role, t)) { setTab(t); setNavOpen(false) }
  }

  useCompanyData()

  const allMonths = useMemo(() => {
    const ms = new Set([...(RAW?.mn ?? []), ...(RAW?.m1 ?? []), ...(RAW?.m2 ?? [])])
    return [...ms].sort()
  }, [RAW?.mn?.join(','), RAW?.m1?.join(','), RAW?.m2?.join(',')])

  if (!user) return <LoginPage onLogin={(u: User) => { setUser(u); getUserRole(u.id).then(setRole) }} />

  if (dataLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'#080d1a', color:'#f1f5f9' }}>
      <Spinner size={36} />
      <div style={{ fontSize:13, color:'#475569' }}>Connexion à la base de données...</div>
    </div>
  )

  const TabContent = () => {
    if (!canAccessTab(role, tab)) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:256, gap:12, textAlign:'center', padding:'0 32px' }}>
        <span style={{ fontSize:40 }}>🔒</span>
        <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Accès restreint</div>
        <div style={{ fontSize:11, color:'#475569', maxWidth:280 }}>Votre rôle ne permet pas d'accéder à cet onglet. Contactez votre administrateur.</div>
      </div>
    )
    if (RAW && RAW.keys.length === 0 && tab !== 'import' && tab !== 'aide' && tab !== 'dashboard' && tab !== 'creances') return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:256, gap:12, textAlign:'center', padding:'0 32px' }}>
        <span style={{ fontSize:40 }}>📁</span>
        <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Aucune donnée disponible</div>
        <div style={{ fontSize:11, color:'#475569', maxWidth:280 }}>Importez un fichier FEC depuis l'onglet Import pour commencer.</div>
      </div>
    )
    const modules: Record<string, [string, React.ReactNode]> = {
      dashboard:      ['Dashboard',       <Dashboard />],
      cr:             ['Compte résultat', <CompteResultat />],
      sig:            ['SIG',             <Sig />],
      equilibre:      ['Équilibre',       <Equilibre />],
      objectifs:      ['Objectifs',       <Objectifs />],
      bilan:          ['Bilan',           <Bilan />],
      ratios:         ['Ratios',          <Ratios />],
      import:         ['Import',          <Import />],
      budget:         ['Budget',          <Budget />],
      saisie:         ['Saisie',          <Saisie />],
      tresorerie:     ['Trésorerie',      <Tresorerie />],
      verification:   ['Vérification',    <Verification />],
      creances:       ['Créances',        <Creances />],
      complementaire: ['Complémentaire',  <Complementaire />],
      aide:           ['Aide',            <Aide />],
    }
    const entry = modules[tab]
    if (!entry) return null
    return <ErrorBoundary key={tab} moduleName={entry[0]}>{entry[1]}</ErrorBoundary>
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#080d1a', color:'#f1f5f9', fontFamily:'Outfit, Inter, sans-serif' }}>
      {/* Overlay mobile */}
      {navOpen && (
        <div onClick={() => setNavOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(2px)' }} />
      )}

      {/* Sidebar */}
      <div className={`sidebar-wrapper${navOpen ? ' open' : ''}`} style={{
        position: 'fixed' as const,
        top: 0, left: 0, bottom: 0,
        zIndex: 50,
      }}>
        <Sidebar onTabChange={handleTabChange} />
      </div>

      {/* Main */}
      <div className="main-content" style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        <TopBar allMonths={allMonths} onMenuClick={() => setNavOpen(o => !o)} />
        <main style={{ flex:1, overflowY:'auto' }}><TabContent /></main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary moduleName="Application">
      <QueryClientProvider client={queryClient}><AppInner /></QueryClientProvider>
    </ErrorBoundary>
  )
}
