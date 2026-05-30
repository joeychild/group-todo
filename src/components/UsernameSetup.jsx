import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeInOnMount } from '../hooks/useFadeIn'

export default function UsernameSetup({ userId, onComplete }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const visible = useFadeInOnMount(50)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: username.toLowerCase().trim(),
        display_name: displayName.trim() || username.trim()
      })
      .select()
      .single()

    if (error) {
      setError(error.code === '23505' ? 'That username is taken.' : 'Something went wrong.')
    } else {
      onComplete(data)
    }
    setLoading(false)
  }

  return (
    <div className={`auth-page ${visible ? 'fade-in' : ''}`}>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">✦</div>
          <h1>Almost there</h1>
          <p>Set up your public profile.</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label>Display name</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Username <span className="field-hint">— how others find you</span></label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">@</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                required
              />
            </div>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Saving…' : 'Continue →'}
          </button>
        </form>
      </div>
    </div>
  )
}
