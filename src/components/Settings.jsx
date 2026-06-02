import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAudio } from '../context/AudioContext'
import { useNotifications } from '../context/NotificationContext'
import { useFadeIn } from '../hooks/useFadeIn'

const NOTIF_PREF_OPTIONS = [
  { key: 'friend_request',        label: 'Friend requests',            desc: 'When someone sends you a friend request' },
  { key: 'friend_removed',        label: 'Friend removals',            desc: 'When someone removes you as a friend' },
  { key: 'friend_list_created',   label: 'Friend list activity',       desc: 'When a friend creates a new list' },
  { key: 'due_date',              label: 'Due date alerts',            desc: 'Toast when a task is due' },
]

function defaultGradient(seed = '') {
  const h1 = (((seed.charCodeAt(0) || 0) * 37) + ((seed.charCodeAt(1) || 0) * 13)) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
}

// Compress image file before upload
async function compressImage(file, maxDim = 800, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

function AudioBlock({ title, hint, type, settings, updateSettings, loadCustomFile, onPreview }) {
  const fileRef = useRef()
  const soundKey  = `${type}Sound`
  const volKey    = `${type}Volume`
  const urlKey    = `custom${type.charAt(0).toUpperCase() + type.slice(1)}Url`
  const nameKey   = `custom${type.charAt(0).toUpperCase() + type.slice(1)}Name`

  const currentSound  = settings[soundKey]
  const currentVol    = settings[volKey]
  const currentName   = settings[nameKey]

  return (
    <div className="settings-block">
      <h3>{title}</h3>
      <p className="settings-hint">{hint}</p>
      <div className="audio-options">
        {['default', 'custom', 'off'].map(opt => (
          <label key={opt} className={`radio-opt ${currentSound === opt ? 'active' : ''}`}>
            <input type="radio" name={`${type}Sound`} value={opt}
              checked={currentSound === opt}
              onChange={() => updateSettings({ [soundKey]: opt })} />
            {opt === 'default' ? '🔔 Default' : opt === 'custom' ? '📁 Custom file' : '🔇 Off'}
          </label>
        ))}
      </div>
      {currentSound === 'custom' && (
        <div className="file-drop-area" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={e => {
            if (e.target.files[0]) {
              loadCustomFile(type, e.target.files[0])
              e.target.value = ''
            }
          }} />
          <span>
            {currentName
              ? <>✓ <strong>{currentName}</strong> — click to replace</>
              : 'Click to upload audio file (max 10s)'}
          </span>
        </div>
      )}
      <div className="volume-row">
        <label>Volume</label>
        <input type="range" min="0" max="1" step="0.05" value={currentVol}
          onChange={e => updateSettings({ [volKey]: parseFloat(e.target.value) })}
          disabled={currentSound === 'off'} />
        <span>{Math.round(currentVol * 100)}%</span>
      </div>
      <button className="btn-ghost-sm" onClick={onPreview} disabled={currentSound === 'off'}>▶ Preview</button>
    </div>
  )
}

export default function Settings({ profile, onProfileUpdate }) {
  const [tab, setTab] = useState('profile')
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url)
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(profile.banner_url)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const { settings: audioSettings, updateSettings: updateAudio, loadCustomFile,
    playNudge, playNotification, playStartup, playRemoveNudge } = useAudio()
  const { prefs, savePrefs, DEFAULT_PREFS } = useNotifications()
  const visible = useFadeIn([tab])

  const bannerStyle = bannerPreview
    ? { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: defaultGradient(profile.id || profile.username || '') }

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file)
    setAvatarFile(compressed)
    setAvatarPreview(URL.createObjectURL(compressed))
  }

  const handleBannerChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file, 1200, 0.80)
    setBannerFile(compressed)
    setBannerPreview(URL.createObjectURL(compressed))
  }

  const saveProfile = async () => {
    setSaving(true); setMsg('')
    let avatar_url = profile.avatar_url
    let banner_url = profile.banner_url

    if (avatarFile) {
      const ext = 'jpg'
      const path = `${profile.id}/avatar.${ext}`
      await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      avatar_url = urlData.publicUrl
    } else if (avatarPreview === null) {
      avatar_url = null
    }

    if (bannerFile) {
      const ext = 'jpg'
      const path = `${profile.id}/banner.${ext}`
      await supabase.storage.from('avatars').upload(path, bannerFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      banner_url = urlData.publicUrl
    } else if (bannerPreview === null) {
      banner_url = null
    }

    const { data, error } = await supabase.from('profiles')
      .update({ display_name: displayName.trim(), bio: bio.trim(), avatar_url, banner_url })
      .eq('id', profile.id).select().single()
    if (error) setMsg('Error saving profile.')
    else { onProfileUpdate(data); setMsg('Profile saved!') }
    setSaving(false)
  }

  const changePassword = async () => {
    if (newPw !== confirmPw) { setMsg('Passwords do not match.'); return }
    if (newPw.length < 8) { setMsg('Password must be at least 8 characters.'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setMsg(error.message)
    else { setMsg('Password updated!'); setNewPw(''); setConfirmPw('') }
    setSaving(false)
  }

  const changeEmail = async () => {
    if (!newEmail.trim()) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (error) setMsg(error.message)
    else setMsg('Confirmation sent to your new email address.')
    setSaving(false)
  }

  const deleteAccount = async () => {
    if (deleteConfirm !== profile.username) {
      setMsg(`Type your username "${profile.username}" to confirm deletion.`); return
    }
    const { error } = await supabase.rpc('delete_user')
    if (error) setMsg('Could not delete account: ' + error.message)
    else await supabase.auth.signOut()
  }

  const togglePref = (key) => savePrefs({ ...prefs, [key]: !prefs[key] })
  const selectAll = () => savePrefs(Object.fromEntries(Object.keys(DEFAULT_PREFS).map(k => [k, true])))
  const removeAll = () => savePrefs(Object.fromEntries(Object.keys(DEFAULT_PREFS).map(k => [k, false])))

  return (
    <div className={`page ${visible ? 'fade-in' : ''}`}>
      <div className="page-header">
        <h2>Settings</h2>
        <div className="tab-row">
          {[['profile', 'Profile'], ['account', 'Account'], ['audio', 'Audio'], ['notifications', 'Notifications']].map(([id, label]) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMsg('') }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className={`settings-msg ${msg.includes('Error') || msg.includes('match') || msg.includes('least') ? 'error' : 'success'}`}>{msg}</p>}

      {tab === 'profile' && (
        <div className="settings-section">
          <div className="settings-block" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="profile-banner-preview" style={bannerStyle}>
              <div className="profile-banner-overlay" />
              <div className="profile-banner-controls">
                <label className="btn-ghost" style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', fontSize: 12 }}>
                  {bannerPreview ? 'Change banner' : 'Add banner'}
                  <input type="file" accept="image/*" onChange={handleBannerChange} hidden />
                </label>
                {bannerPreview && (
                  <button className="btn-ghost-sm" style={{ background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
                    onClick={() => { setBannerPreview(null); setBannerFile(null) }}>Remove</button>
                )}
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="avatar-upload-row">
                <div className="avatar-lg">
                  {avatarPreview ? <img src={avatarPreview} alt="" /> : <span>{(profile.display_name || profile.username)[0].toUpperCase()}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="btn-ghost">
                    Change avatar
                    <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
                  </label>
                  {avatarPreview && (
                    <button className="btn-ghost-sm" onClick={() => { setAvatarPreview(null); setAvatarFile(null) }}>Remove</button>
                  )}
                </div>
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label>Display name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} />
              </div>
              <div className="field">
                <label>Username <span className="field-hint">(can't be changed)</span></label>
                <input value={profile.username} disabled />
              </div>
              <div className="field">
                <label>Bio</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={160} placeholder="A short bio…" />
              </div>
              <button className="btn-primary" style={{ marginTop: 4 }} onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'account' && (
        <div className="settings-section">
          <div className="settings-block">
            <h3>Sign out</h3>
            <p className="settings-hint">You'll be returned to the login screen.</p>
            <button className="btn-ghost signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
          <div className="settings-block">
            <h3>Change password</h3>
            <div className="field">
              <label>New password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={changePassword} disabled={saving}>Update password</button>
          </div>
          <div className="settings-block">
            <h3>Change email</h3>
            <p className="settings-hint">A confirmation link will be sent to your new address.</p>
            <div className="field">
              <label>New email address</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={changeEmail} disabled={saving}>Send confirmation</button>
          </div>
          <div className="settings-block danger-zone">
            <h3>Delete account</h3>
            <p className="settings-hint">Permanently deletes your account, all lists, and tasks. Cannot be undone.</p>
            <div className="field">
              <label>Type <strong>{profile.username}</strong> to confirm</label>
              <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={profile.username} />
            </div>
            <button className="btn-danger" onClick={deleteAccount}>Delete my account</button>
          </div>
        </div>
      )}

      {tab === 'audio' && (
        <div className="settings-section">
          <AudioBlock
            title="Startup sound"
            hint='Plays when "My Lists" is opened.'
            type="startup"
            settings={audioSettings} updateSettings={updateAudio} loadCustomFile={loadCustomFile}
            onPreview={playStartup}
          />
          <AudioBlock
            title="Nudge sound"
            hint="Played when you nudge someone's task."
            type="nudge"
            settings={audioSettings} updateSettings={updateAudio} loadCustomFile={loadCustomFile}
            onPreview={playNudge}
          />
          <AudioBlock
            title="Remove nudge sound"
            hint="Played when you un-nudge a task."
            type="removeNudge"
            settings={audioSettings} updateSettings={updateAudio} loadCustomFile={loadCustomFile}
            onPreview={playRemoveNudge}
          />
          <AudioBlock
            title="Notification sound"
            hint="Played for friend requests, acceptances, and other alerts."
            type="notification"
            settings={audioSettings} updateSettings={updateAudio} loadCustomFile={loadCustomFile}
            onPreview={playNotification}
          />
        </div>
      )}

      {tab === 'notifications' && (
        <div className="settings-section">
          <div className="settings-block">
            <div className="notif-pref-header">
              <h3>Notification preferences</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost-sm" onClick={selectAll}>Select all</button>
                <button className="btn-ghost-sm" onClick={removeAll}>Remove all</button>
              </div>
            </div>
            <p className="settings-hint">Choose which events trigger in-app notifications and sounds.</p>
            <div className="notif-pref-list">
              {NOTIF_PREF_OPTIONS.map(opt => (
                <label key={opt.key} className="notif-pref-row">
                  <input type="checkbox" checked={prefs[opt.key] ?? true}
                    onChange={() => togglePref(opt.key)} className="notif-pref-check" />
                  <div className="notif-pref-text">
                    <span className="notif-pref-label">{opt.label}</span>
                    <span className="notif-pref-desc">{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}