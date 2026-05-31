import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAudio } from '../context/AudioContext'
import { useNotifications } from '../context/NotificationContext'
import { useFadeIn } from '../hooks/useFadeIn'

const NOTIF_PREF_OPTIONS = [
  { key: 'nudge',                 label: 'Task nudges',                desc: 'When a friend nudges you about a task' },
  { key: 'friend_request',        label: 'Friend requests',            desc: 'When someone sends you a friend request' },
  { key: 'friend_removed',        label: 'Friend removals',            desc: 'When someone removes you as a friend' },
  { key: 'nudged_task_completed', label: 'Nudged task completed',      desc: 'When a task you nudged gets completed' },
  { key: 'friend_list_created',   label: 'Friend list activity',       desc: 'When a friend creates a new list' },
  { key: 'due_date',              label: 'Due date alerts',            desc: 'Toast when a task is due' },
]

export default function Settings({ profile, onProfileUpdate }) {
  const [tab, setTab] = useState('profile')
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const { settings: audioSettings, updateSettings: updateAudio, loadCustomFile, playNudge, playNotification } = useAudio()
  const { prefs, savePrefs, DEFAULT_PREFS } = useNotifications()
  const nudgeFileRef = useRef()
  const notifFileRef = useRef()
  const visible = useFadeIn([tab])

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const saveProfile = async () => {
    setSaving(true); setMsg('')
    let avatar_url = profile.avatar_url
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${profile.id}/avatar.${ext}`
      await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      avatar_url = urlData.publicUrl
    }
    const { data, error } = await supabase.from('profiles')
      .update({ display_name: displayName.trim(), bio: bio.trim(), avatar_url })
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
          <div className="avatar-upload-row">
            <div className="avatar-lg">
              {avatarPreview
                ? <img src={avatarPreview} alt="" />
                : <span>{(profile.display_name || profile.username)[0].toUpperCase()}</span>
              }
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
          <div className="field">
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
          <button className="btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
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
          <div className="settings-block">
            <h3>Nudge sound</h3>
            <div className="audio-options">
              {['default', 'custom', 'off'].map(opt => (
                <label key={opt} className={`radio-opt ${audioSettings.nudgeSound === opt ? 'active' : ''}`}>
                  <input type="radio" name="nudgeSound" value={opt}
                    checked={audioSettings.nudgeSound === opt}
                    onChange={() => updateAudio({ nudgeSound: opt })} />
                  {opt === 'default' ? '🔔 Built-in' : opt === 'custom' ? '📁 Custom file' : '🔇 Off'}
                </label>
              ))}
            </div>
            {audioSettings.nudgeSound === 'custom' && (
              <div className="file-drop-area" onClick={() => nudgeFileRef.current?.click()}>
                <input ref={nudgeFileRef} type="file" accept="audio/*" hidden
                  onChange={e => e.target.files[0] && loadCustomFile('nudge', e.target.files[0])} />
                <span>{audioSettings.customNudgeUrl ? '✓ Custom file loaded — click to replace' : 'Click to upload audio file'}</span>
              </div>
            )}
            <div className="volume-row">
              <label>Volume</label>
              <input type="range" min="0" max="1" step="0.05" value={audioSettings.nudgeVolume}
                onChange={e => updateAudio({ nudgeVolume: parseFloat(e.target.value) })}
                disabled={audioSettings.nudgeSound === 'off'} />
              <span>{Math.round(audioSettings.nudgeVolume * 100)}%</span>
            </div>
            <button className="btn-ghost-sm" onClick={playNudge} disabled={audioSettings.nudgeSound === 'off'}>▶ Preview</button>
          </div>

          <div className="settings-block">
            <h3>Notification sound</h3>
            <div className="audio-options">
              {['default', 'custom', 'off'].map(opt => (
                <label key={opt} className={`radio-opt ${audioSettings.notificationSound === opt ? 'active' : ''}`}>
                  <input type="radio" name="notifSound" value={opt}
                    checked={audioSettings.notificationSound === opt}
                    onChange={() => updateAudio({ notificationSound: opt })} />
                  {opt === 'default' ? '🔔 Built-in' : opt === 'custom' ? '📁 Custom file' : '🔇 Off'}
                </label>
              ))}
            </div>
            {audioSettings.notificationSound === 'custom' && (
              <div className="file-drop-area" onClick={() => notifFileRef.current?.click()}>
                <input ref={notifFileRef} type="file" accept="audio/*" hidden
                  onChange={e => e.target.files[0] && loadCustomFile('notification', e.target.files[0])} />
                <span>{audioSettings.customNotificationUrl ? '✓ Custom file loaded — click to replace' : 'Click to upload audio file'}</span>
              </div>
            )}
            <div className="volume-row">
              <label>Volume</label>
              <input type="range" min="0" max="1" step="0.05" value={audioSettings.notificationVolume}
                onChange={e => updateAudio({ notificationVolume: parseFloat(e.target.value) })}
                disabled={audioSettings.notificationSound === 'off'} />
              <span>{Math.round(audioSettings.notificationVolume * 100)}%</span>
            </div>
            <button className="btn-ghost-sm" onClick={playNotification} disabled={audioSettings.notificationSound === 'off'}>▶ Preview</button>
          </div>
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
                  <input
                    type="checkbox"
                    checked={prefs[opt.key] ?? true}
                    onChange={() => togglePref(opt.key)}
                    className="notif-pref-check"
                  />
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