import { useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sb, getUserRole } from '@/lib/supabase'
import { useAppStore } from '@/store'
import { Sidebar }          from '@/components/layout/Sidebar'
import { TopBar }           from '@/components/layout/TopBar'
import { Spinner }          from '@/components/ui'
import { LoginPage }        from '@/modules/auth/LoginPage'
import { CompteResultat }   from '@/modules/cr/CompteResultat'
import { Sig }              from '@/modules/sig/Sig'
import { Equilibre }        from '@/modules/equilibre/Equilibre'
import { Objectifs }        from '@/modules/objectifs/Objectifs'
import { Bilan }            from '@/modules/bilan/Bilan'
import { Ratios }           from '@/modules/ratios/Ratios'
import { Import }           from '@/modules/import/Import'
import { Budget }           from '@/modules/budget/Budget'
import { Saisie }           from '@/modules/saisie/Saisie'
import { Tresorerie }       from '@/modules/tresorerie/Tresorerie'
import { Verification }     from '@/modules/verification/Verification'
import { Complementaire }   from '@/modules/complementaire/Complementaire'
import { useCompanyData }   from '@/hooks/useCompanyData'
import type { User }        from '@supabase/supabase-js'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } }
})

function AppInner() {
  const user        = useAppStore(s => s.user)
  const setUser     = useAppStore(s => s.setUser)
  const setRole     = useAppStore(s => s.setRole)
  const dataLoading = useAppStore(s => s.dataLoading)
  const RAW         = useAppStore(s => s.RAW)
  const tab         = useAppStore(s => s.tab)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) { setUser(data.session.user); getUserRole(data.session.user.id).then(setRole) }
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
  }, [RAW?.mn?.join(','), RAW?.m1?.join(',')])

  if (!user) return <LoginPage onLogin={(u: User) => { setUser(u); getUserRole(u.id).then(setRole) }} />

  if (dataLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'#080d1a', color:'#f1f5f9' }}>
      <Spinner size={36} />
      <div style={{ fontSize:13, color:'#475569' }}>Connexion à la base de données...</div>
    </div>
  )

  const TabContent = () => {
    if (RAW && RAW.keys.length === 0 && tab !== 'import') return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:256, gap:12, textAlign:'center', padding:'0 32px' }}>
        <span style={{ fontSize:40 }}>📁</span>
        <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9' }}>Aucune donnée disponible</div>
        <div style={{ fontSize:11, color:'#475569', maxWidth:280 }}>Importez un fichier FEC depuis l'onglet Import pour commencer.</div>
      </div>
    )
    switch (tab) {
      case 'cr':             return <CompteResultat />
      case 'sig':            return <Sig />
      case 'equilibre':      return <Equilibre />
      case 'objectifs':      return <Objectifs />
      case 'bilan':          return <Bilan />
      case 'ratios':         return <Ratios />
      case 'import':         return <Import />
      case 'budget':         return <Budget />
      case 'saisie':         return <Saisie />
      case 'tresorerie':     return <Tresorerie />
      case 'verification':   return <Verification />
      case 'complementaire': return <Complementaire />
      case 'aide': return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:256, gap:12, color:'#475569' }}>
          <span style={{ fontSize:36 }}>❓</span>
          <span style={{ fontWeight:700, color:'#f1f5f9', fontSize:14 }}>Aide & documentation</span>
          <span style={{ fontSize:11 }}>Contactez votre administrateur Adam Boards.</span>
        </div>
      )
      default: return null
    }
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#080d1a', color:'#f1f5f9', fontFamily:'Outfit, Inter, sans-serif' }}>
      <Sidebar />
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
        <TopBar allMonths={allMonths} />
        <main style={{ flex:1, overflowY:'auto' }}><TabContent /></main>
      </div>
    </div>
  )
}

export default function App() {
  return <QueryClientProvider client={queryClient}><AppInner /></QueryClientProvider>
}
