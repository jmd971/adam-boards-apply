import { useState } from 'react'
import { sb } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import type { User } from '@supabase/supabase-js'

interface LoginPageProps {
  onLogin: (user: User) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode]       = useState<'login' | 'signup'>('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true); setError(null)
    try {
      const { data, error: err } = mode === 'login'
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password })

      if (err) throw err
      if (data.user) onLogin(data.user)
    } catch (e: any) {
      setError(e.message || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `
    w-full px-4 py-3 rounded-xl text-sm text-white
    bg-white/5 border border-white/10
    focus:outline-none focus:border-brand-blue/60 focus:bg-white/8
    placeholder:text-muted transition-all
  `

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#080d1a', fontFamily: 'Outfit, Inter, sans-serif' }}>
      <div className="w-full max-w-sm mx-4">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>
            <span className="text-2xl">📊</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            <span className="text-brand-blue">adam</span>boards
          </h1>
          <p className="text-sm text-muted mt-1">Tableau de bord financier</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8"
          style={{ background: '#0d1426', border: '1px solid rgba(255,255,255,0.07)' }}>

          {/* Tabs login / signup */}
          <div className="flex rounded-xl overflow-hidden mb-6"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: mode === m ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: mode === m ? '#93c5fd' : '#475569',
                  border: 'none', cursor: 'pointer',
                  boxShadow: mode === m ? 'inset 0 0 0 1px rgba(59,130,246,0.3)' : 'none',
                  borderRadius: 10,
                }}>
                {m === 'login' ? 'Connexion' : 'Créer un compte'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
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
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all mt-2"
              style={{
                background: loading ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg,#3b82f6,#6366f1)',
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Connexion...</span>
                : mode === 'login' ? 'Se connecter' : 'Créer le compte'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
