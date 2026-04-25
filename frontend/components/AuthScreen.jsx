import React, { useState } from 'react'
import { register, login, getFingerprint } from '../utils/api'

export default function AuthScreen({ onAuth }) {
  const [mode, setMode]       = useState('login')   // login | register
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim()) return
    setLoading(true)
    setError('')
    try {
      const fp   = getFingerprint()
      const data = mode === 'register'
        ? await register(username.trim(), fp)
        : await login(username.trim(), fp)

      localStorage.setItem('chat_token',    data.token)
      localStorage.setItem('chat_user_id',  data.user_id)
      localStorage.setItem('chat_username', data.username)
      onAuth(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-discord-bg relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-discord-accent/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay:'1s'}} />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(88,101,242,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(88,101,242,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-discord-accent rounded-2xl flex items-center justify-center shadow-lg glow-accent">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-white fill-current">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
              </svg>
            </div>
            <div className="text-left">
              <div className="text-white font-display font-bold text-xl tracking-tight">SecureChat</div>
              <div className="text-discord-muted text-xs font-mono">IDS v1.0</div>
            </div>
          </div>
          <h1 className="text-discord-text text-base">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8">
          {/* Mode toggle */}
          <div className="flex bg-discord-sidebar rounded-xl p-1 mb-6">
            {['login','register'].map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-discord-accent text-white shadow-sm'
                    : 'text-discord-muted hover:text-discord-text'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-discord-muted text-xs font-mono uppercase tracking-wider mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username..."
                maxLength={24}
                className="w-full bg-discord-sidebar border border-discord-border rounded-xl px-4 py-3 text-discord-text placeholder-discord-muted text-sm outline-none focus:border-discord-accent transition-colors"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="w-full bg-discord-accent hover:bg-discord-accent-h disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-discord-accent/25"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {mode === 'register' ? 'Creating...' : 'Signing in...'}
                </span>
              ) : (
                mode === 'register' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Security badge */}
          <div className="mt-6 pt-6 border-t border-discord-border flex items-center gap-2 text-discord-muted text-xs">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-discord-green flex-shrink-0">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
            <span>Device fingerprint bound · Session encrypted · Zero Trust model</span>
          </div>
        </div>
      </div>
    </div>
  )
}
