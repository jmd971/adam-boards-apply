import { useState } from 'react'
import { sb } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { AdamBoardsLogo } from '@/components/Logo'
import type { User } from '@supabase/supabase-js'

interface LoginPageProps {
  onLogin: (user: User) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode]         = useState<'login' | 'signup'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany]   = useState('')
  const [loading, setLoading]   = useState(false)

  // Lire l'erreur OAuth depuis le hash de l'URL si présent
  const urlError = (() => {
    const h = window.location.hash
    if (h.includes('error=')) {
      const msg = decodeURIComponent(h.match(/error_description=([^&]*)/)?.[1] ?? '')
      window.history.replaceState(null, '', window.location.pathname)
      if (msg.includes('expired') || msg.includes('Invalid')) return 'Le lien de confirmation a expiré. Reconnectez-vous avec email + mot de passe.'
      return msg || 'Erreur de connexion OAuth.'
    }
    return null
  })()

  const [error, setError] = useState<string | null>(urlError)

  const handleSubmit = async () => {
    if (!email || !password) return
    if (mode === 'signup' && !company.trim()) {
      setError('Le nom de la société est obligatoire.')
      return
    }
    setLoading(true); setError(null)
    try {
      if (mode === 'login') {
        const { data, error: err } = await sb.auth.signInWithPassword({ email, password })
        if (err) throw err
        if (data.user) onLogin(data.user)
      } else {
        // ── Inscription ──────────────────────────────────────────────
        // 1. Créer le compte Supabase Auth
        const { data, error: signUpErr } = await sb.auth.signUp({ email, password })
        if (signUpErr) throw signUpErr
        if (!data.user) throw new Error('Compte non créé — réessayez.')

        // 2. Provisionner le tenant + rôle admin via la RPC sécurisée
        //    (SECURITY DEFINER, vérifie auth.uid() == p_user_id)
        const { error: rpcErr } = await sb.rpc('provision_new_user', {
          p_user_id:     data.user.id,
          p_tenant_name: company.trim(),
          p_role:        'admin',
        })
        if (rpcErr) throw rpcErr

        onLogin(data.user)
      }
    } catch (e: any) {
      setError(e.message || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl text-sm text-[#111726]
    bg-white/5 border border-white/10
    focus:outline-none focus:border-brand-blue/60 focus:bg-white/8
    placeholder:text-muted transition-all
  `

  return (
    <div className="min-h-screen flex items-center justify-center ab-light"
      style={{ background: 'var(--bg-0)', fontFamily: 'Outfit, Inter, sans-serif' }}>
      <div className="w-full max-w-sm mx-4">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <AdamBoardsLogo width={300} />
          <p className="text-sm text-muted mt-2">Tableau de bord financier</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8"
          style={{ background: 'var(--bg-1)', border: '1px solid var(--border-1)' }}>

          {/* Tabs login / signup */}
          <div className="flex rounded-xl overflow-hidden mb-6"
            style={{ background: 'var(--bg-2)' }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null) }}
                className="flex-1 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: mode === m ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: mode === m ? '#1e88c7' : 'var(--text-2)',
                  border: 'none', cursor: 'pointer',
                  boxShadow: mode === m ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
                  borderRadius: 10,
                }}>
                {m === 'login' ? 'Connexion' : 'Créer un compte'}
              </button>
            ))}
          </div>

          <div className="space-y-3">

            {/* Nom de la société — uniquement en mode signup */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-muted mb-1.5">Nom de la société</label>
                <input
                  type="text"
                  placeholder="Ex : Maison Caraïbe"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-muted mb-1.5">Email</label>
              <input
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Mot de passe</label>
              <input
                type="password"
                placeholder="8 caractères minimum"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className={inputClass}
              />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg text-xs text-brand-red bg-brand-red/10 border border-brand-red/20">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password || (mode === 'signup' && !company.trim())}
              className="w-full py-3 rounded-xl text-sm font-bold text-[#111726] transition-all mt-2"
              style={{
                background: loading ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg,#1e88c7,#6366f1)',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2"><Spinner size={16} /> {mode === 'login' ? 'Connexion...' : 'Création...' }</span>
                : mode === 'login' ? 'Se connecter' : 'Créer le compte'
              }
            </button>
          </div>
        </div>

        {mode === 'signup' && (
          <p className="text-center text-xs text-muted mt-4">
            Votre compte sera créé avec le rôle <strong style={{ color: '#1e88c7' }}>Administrateur</strong>.
          </p>
        )}
      </div>
    </div>
  )
}
