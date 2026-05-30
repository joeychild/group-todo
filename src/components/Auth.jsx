import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeInOnMount } from '../hooks/useFadeIn'

export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const visible = useFadeInOnMount(50)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email for a confirmation link.')
    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '?reset=true'
      })
      if (error) setError(error.message)
      else setMessage('Password reset link sent — check your email.')
    }

    setLoading(false)
  }

  return (
    <div className={`auth-page ${visible ? 'fade-in' : ''}`}>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">✦</div>
          <h1>GroupDo</h1>
          <p>Share lists. Stay accountable. Get nudged.</p>
        </div>

        <div className="auth-tabs">
          {['login', 'signup'].map(m => (
            <button
              key={m}
              className={`auth-tab ${mode === m ? 'active' : ''}`}
              onClick={() => { setMode(m); setError(''); setMessage('') }}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {mode === 'forgot' ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <p className="auth-hint">Enter your email and we'll send a reset link.</p>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-message">{message}</p>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" className="auth-link" onClick={() => setMode('login')}>
              ← Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {mode === 'signup' && (
              <div className="field">
                <label>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}
            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-message">{message}</p>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            {mode === 'login' && (
              <button type="button" className="auth-link" onClick={() => { setMode('forgot'); setError('') }}>
                Forgot password?
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
