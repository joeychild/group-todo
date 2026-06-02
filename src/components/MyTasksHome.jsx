import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'
import { useAudio } from '../context/AudioContext'

const VISIBILITY_ICONS  = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }
const VISIBILITY_LABELS = { private: 'Private', friends: 'Friends', groups: 'Groups', public: 'Public' }

export function defaultGradient(seed = '') {
  const h1 = (((seed.charCodeAt(0) || 0) * 37) + ((seed.charCodeAt(1) || 0) * 13)) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
}

// Compress image before upload
export async function compressImage(file, maxDim = 800, quality = 0.82) {
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

function ListAvatar({ group, size = 44 }) {
  if (group.cover_url) return (
    <img src={group.cover_url} alt=""
      style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
  )
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: defaultGradient(group.id || group.name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.46, userSelect: 'none',
    }}>
      {group.icon || '📋'}
    </div>
  )
}

export default function MyTasksHome({ listGroups, onSelectGroup, onTogglePin, onGroupCreated, onGroupUpdated, onGroupDeleted, userId }) {
  const [showModal, setShowModal] = useState(false)
  const [editGroup, setEditGroup] = useState(null)
  const visible = useFadeIn([listGroups.length])
  const { playStartup } = useAudio()
  const hasPlayed = useRef(false)

  // Play startup sound once on mount
  useEffect(() => {
    if (!hasPlayed.current) {
      hasPlayed.current = true
      setTimeout(() => playStartup(), 200)
    }
  }, [])

  const pinned   = listGroups.filter(g => g.pinned)
  const unpinned = listGroups.filter(g => !g.pinned)

  return (
    <div className={`my-tasks-home ${visible ? 'fade-in' : ''}`}>
      <div className="tasks-home-header">
        <div className="tasks-home-title-group">
          <h2>My Lists</h2>
          <p className="tasks-home-meta">
            {listGroups.length === 0
              ? 'Create your first list to get started'
              : `${listGroups.length} list${listGroups.length !== 1 ? 's' : ''}${pinned.length ? ` · ${pinned.length} pinned` : ''}`
            }
          </p>
        </div>
        <button className="btn-create-list" onClick={() => setShowModal(true)}>
          + New list
        </button>
      </div>

      {listGroups.length === 0 && (
        <div className="empty-hero">
          <div className="empty-hero-art">
            <div className="eh-blob b1" />
            <div className="eh-blob b2" />
            <div className="eh-blob b3" />
            <span className="eh-glyph">✦</span>
          </div>
          <h3>No lists yet</h3>
          <p>Lists keep your tasks organised and shareable with friends.<br/>Start by creating your first one.</p>
          <button className="btn-primary" onClick={() => setShowModal(true)} style={{ marginTop: 16 }}>
            Create a list
          </button>
        </div>
      )}

      {pinned.length > 0 && (
        <section className="lists-section">
          <div className="lists-section-row">
            <h3 className="lists-section-label">Pinned</h3>
            <span className="lists-section-count">{pinned.length}</span>
          </div>
          <div className="pinned-grid">
            {pinned.map((group, i) => (
              <ListCard key={group.id} group={group} index={i}
                onOpen={() => onSelectGroup(group)}
                onTogglePin={() => onTogglePin(group)}
                onEdit={() => setEditGroup(group)} />
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section className="lists-section">
          {pinned.length > 0 && (
            <div className="lists-section-row">
              <h3 className="lists-section-label">All lists</h3>
              <span className="lists-section-count">{unpinned.length}</span>
            </div>
          )}
          <ul className="list-rows">
            {unpinned.map((group, i) => (
              <ListRow key={group.id} group={group} index={i}
                onOpen={() => onSelectGroup(group)}
                onTogglePin={() => onTogglePin(group)}
                onEdit={() => setEditGroup(group)} />
            ))}
          </ul>
        </section>
      )}

      {showModal && (
        <CreateListModal
          userId={userId}
          onCreated={(g) => { onGroupCreated(g); setShowModal(false) }}
          onClose={() => setShowModal(false)}
        />
      )}

      {editGroup && (
        <EditListModal
          group={editGroup}
          userId={userId}
          onSaved={(updated) => { onGroupUpdated(updated); setEditGroup(null) }}
          onDeleted={() => { onGroupDeleted(editGroup.id); setEditGroup(null) }}
          onClose={() => setEditGroup(null)}
        />
      )}
    </div>
  )
}

// ── Shared: friend/group pickers ───────────────────────────────────────────
function FriendGroupDropdown({ userId, selectedIds, onChange }) {
  const [groups, setGroups] = useState([])
  useEffect(() => {
    supabase.from('friend_groups').select('id, name').eq('owner_id', userId)
      .then(({ data }) => setGroups(data ?? []))
  }, [userId])

  return (
    <div className="friend-group-share-picker">
      <div className="fgs-header">
        <span className="fgs-label">Visible to these friend groups:</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-ghost-sm"
            onClick={() => onChange(groups.map(g => g.id))}>Select all</button>
          <button type="button" className="btn-ghost-sm"
            onClick={() => onChange([])}>Remove all</button>
        </div>
      </div>
      {groups.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-light)' }}>No friend groups yet. Create some in Friends → Groups.</p>
        : groups.map(fg => (
            <label key={fg.id} className="fgs-row">
              <input type="checkbox" checked={selectedIds.includes(fg.id)}
                onChange={() => onChange(selectedIds.includes(fg.id)
                  ? selectedIds.filter(x => x !== fg.id)
                  : [...selectedIds, fg.id])} />
              <span>{fg.name}</span>
            </label>
          ))
      }
    </div>
  )
}

function FriendDropdown({ userId, selectedIds, onChange }) {
  const [friends, setFriends] = useState([])
  useEffect(() => {
    supabase.from('friendships')
      .select('id, user_a, user_b, profile_a:profiles!friendships_user_a_fkey(id, username, display_name), profile_b:profiles!friendships_user_b_fkey(id, username, display_name)')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .then(({ data }) => setFriends((data ?? []).map(f => f.user_a === userId ? f.profile_b : f.profile_a).filter(Boolean)))
  }, [userId])

  return (
    <div className="friend-group-share-picker">
      <div className="fgs-header">
        <span className="fgs-label">Visible to these friends:</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-ghost-sm"
            onClick={() => onChange(friends.map(f => f.id))}>Select all</button>
          <button type="button" className="btn-ghost-sm"
            onClick={() => onChange([])}>Remove all</button>
        </div>
      </div>
      {friends.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-light)' }}>No friends yet.</p>
        : friends.map(f => (
            <label key={f.id} className="fgs-row">
              <input type="checkbox" checked={selectedIds.includes(f.id)}
                onChange={() => onChange(selectedIds.includes(f.id)
                  ? selectedIds.filter(x => x !== f.id)
                  : [...selectedIds, f.id])} />
              <span>{f.display_name || f.username}</span>
            </label>
          ))
      }
    </div>
  )
}

// ── Visibility picker used in both Create + Edit ───────────────────────────
function VisibilityPicker({ visibility, setVisibility, userId, friendGroupShares, setFriendGroupShares, friendShares, setFriendShares }) {
  return (
    <>
      <div className="vis-picker">
        {[
          { value: 'private', icon: '🔒', label: 'Private',  desc: 'Only you' },
          { value: 'friends', icon: '👥', label: 'Friends',  desc: 'Select specific friends' },
          { value: 'groups',  icon: '🫂', label: 'Groups',   desc: 'Select friend groups' },
          { value: 'public',  icon: '🌐', label: 'Public',   desc: 'Anyone can view' },
        ].map(opt => (
          <button key={opt.value} type="button"
            className={`vis-opt ${visibility === opt.value ? 'active' : ''}`}
            onClick={() => setVisibility(opt.value)}
          >
            <span className="vis-opt-icon">{opt.icon}</span>
            <div className="vis-opt-text">
              <span className="vis-opt-label">{opt.label}</span>
              <span className="vis-opt-desc">{opt.desc}</span>
            </div>
            {visibility === opt.value && <span className="vis-opt-check">✓</span>}
          </button>
        ))}
      </div>
      {visibility === 'groups' && (
        <FriendGroupDropdown userId={userId} selectedIds={friendGroupShares} onChange={setFriendGroupShares} />
      )}
      {visibility === 'friends' && (
        <FriendDropdown userId={userId} selectedIds={friendShares} onChange={setFriendShares} />
      )}
    </>
  )
}

// ── Audio file picker row ──────────────────────────────────────────────────
function AudioFilePicker({ label, audioFile, audioName, onChange, onRemove }) {
  const fileRef = useRef()
  return (
    <div className="audio-file-picker">
      <span className="audio-file-label">{label}</span>
      {audioName ? (
        <div className="audio-file-loaded">
          <span className="audio-file-name">🎵 {audioName}</span>
          <button type="button" className="link-btn" onClick={onRemove}>Remove</button>
          <button type="button" className="btn-ghost-sm" onClick={() => fileRef.current?.click()}>Replace</button>
        </div>
      ) : (
        <button type="button" className="btn-ghost-sm" onClick={() => fileRef.current?.click()}>
          + Add audio
        </button>
      )}
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={e => {
        const file = e.target.files[0]
        if (!file) return
        // Validate 10s
        const url = URL.createObjectURL(file)
        const audio = new Audio(url)
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(url)
          if (audio.duration > 11) { alert('Audio file must be 10 seconds or less.'); return }
          onChange(file)
        }
        audio.onerror = () => { URL.revokeObjectURL(url); alert('Could not read audio file.') }
        e.target.value = ''
      }} />
    </div>
  )
}

// ── Create list modal ──────────────────────────────────────────────────────
function CreateListModal({ userId, onCreated, onClose }) {
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility]   = useState('private')
  const [avatarFile, setAvatarFile]   = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [friendGroupShares, setFriendGroupShares] = useState([])
  const [friendShares, setFriendShares] = useState([])
  const [audioFile, setAudioFile]     = useState(null)
  const [audioName, setAudioName]     = useState(null)
  const [saving, setSaving]           = useState(false)
  const fileRef = useRef()
  const gradientSeed = name.trim() || 'new'

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file)
    setAvatarFile(compressed)
    setAvatarPreview(URL.createObjectURL(compressed))
  }


  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    let cover_url = null
    if (avatarFile) {
      const path = `${userId}/list-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        cover_url = urlData.publicUrl
      }
    }

    let audio_url = null
    if (audioFile) {
      const ext = audioFile.name.split('.').pop()
      const path = `${userId}/list-audio-${Date.now()}.${ext}`
      const { error: aErr } = await supabase.storage.from('avatars').upload(path, audioFile)
      if (!aErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        audio_url = urlData.publicUrl
      }
    }

    const { data: group } = await supabase.from('list_groups').insert({
      owner_id: userId,
      name: name.trim(),
      description: description.trim() || null,
      visibility,
      cover_url,
      audio_url,
      position: 0,
      pinned: false,
    }).select().single()

    // Save friend/group shares
    if (group) {
      if (visibility === 'groups' && friendGroupShares.length) {
        await supabase.from('list_group_shares').insert(
          friendGroupShares.map(fgId => ({ list_group_id: group.id, friend_group_id: fgId }))
        )
      }
      // friend visibility shares could be stored in a separate table if needed
    }

    setSaving(false)
    if (group) onCreated(group)
  }

  return createPortal(
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card create-list-modal">
        <div className="modal-header">
          <h3>New list</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Cover image */}
          <div className="modal-avatar-section">
            <div
              className="modal-avatar-btn"
              onClick={() => fileRef.current?.click()}
              style={{ background: avatarPreview ? 'transparent' : defaultGradient(gradientSeed) }}
              title="Click to upload a cover image"
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="cover" className="modal-avatar-img" />
                : <span className="modal-avatar-glyph">📋</span>
              }
              <div className="modal-avatar-hover">
                <span className="modal-avatar-camera">📷</span>
                <span className="modal-avatar-camera-label">{avatarPreview ? 'Change' : 'Add image'}</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
            {avatarPreview && (
              <button type="button" className="link-btn remove-avatar-btn"
                onClick={() => { setAvatarPreview(null); setAvatarFile(null) }}>
                Remove image
              </button>
            )}
          </div>

          {/* Name */}
          <div className="field">
            <label>List name</label>
            <input className="modal-name-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Work tasks, Groceries…" required autoFocus />
          </div>

          {/* Description */}
          <div className="field">
            <label>Description <span className="field-hint">— optional</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What's this list for?" rows={2} maxLength={280} />
          </div>

          {/* Visibility */}
          <div className="field">
            <label>Who can see this list</label>
            <VisibilityPicker
              visibility={visibility} setVisibility={setVisibility}
              userId={userId}
              friendGroupShares={friendGroupShares} setFriendGroupShares={setFriendGroupShares}
              friendShares={friendShares} setFriendShares={setFriendShares}
            />
          </div>

          {/* Audio */}
          <div className="field">
            <label>Open sound <span className="field-hint">— plays when list is opened (max 10s)</span></label>
            <AudioFilePicker
              label=""
              audioFile={audioFile}
              audioName={audioName}
              onChange={(file) => { setAudioFile(file); setAudioName(file.name) }}
              onRemove={() => { setAudioFile(null); setAudioName(null) }}
            />
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-primary modal-submit-btn" disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create list'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── List card (pinned) ────────────────────────────────────────────────────
function ListCard({ group, index, onOpen, onTogglePin, onEdit }) {
  return (
    <div className="list-card" style={{ '--i': index }} onClick={onOpen}>
      {group.cover_url
        ? <img src={group.cover_url} alt="" className="list-card-bg-img" />
        : <div className="list-card-bg-gradient" style={{ background: defaultGradient(group.id) }} />
      }
      <div className="list-card-overlay" />
      <div className="list-card-body">
        <div className="list-card-vis-pill">
          {VISIBILITY_ICONS[group.visibility]} {VISIBILITY_LABELS[group.visibility]}
        </div>
        <div className="list-card-name">{group.name}</div>
        {group.description && <div className="list-card-desc">{group.description}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="list-card-unpin-btn" onClick={e => { e.stopPropagation(); onEdit() }}>Edit</button>
          <button className="list-card-unpin-btn" onClick={e => { e.stopPropagation(); onTogglePin() }}>Unpin</button>
        </div>
      </div>
    </div>
  )
}

// ── List row (unpinned) ────────────────────────────────────────────────────
function ListRow({ group, index, onOpen, onTogglePin, onEdit }) {
  return (
    <li className="list-row" style={{ '--i': index }} onClick={onOpen}>
      <ListAvatar group={group} size={42} />
      <div className="list-row-info">
        <span className="list-row-name">{group.name}</span>
        <span className="list-row-sub">{group.description || VISIBILITY_LABELS[group.visibility]}</span>
      </div>
      <div className="list-row-right">
        <span className="list-row-vis">{VISIBILITY_ICONS[group.visibility]}</span>
        <button className="list-row-pin-btn" onClick={e => { e.stopPropagation(); onEdit() }} title="Edit">✏️</button>
        <button className="list-row-pin-btn" onClick={e => { e.stopPropagation(); onTogglePin() }} title="Pin">📌</button>
      </div>
    </li>
  )
}

// ── Edit List Modal ───────────────────────────────────────────────────────
export function EditListModal({ group, userId, onSaved, onDeleted, onClose }) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [visibility, setVisibility] = useState(group.visibility)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(group.cover_url)
  const [friendGroupShares, setFriendGroupShares] = useState([])
  const [friendShares, setFriendShares] = useState([])
  const [audioFile, setAudioFile] = useState(null)
  const [audioName, setAudioName] = useState(group.audio_url ? 'Current audio' : null)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  useEffect(() => {
    // Load existing shares
    supabase.from('list_group_shares').select('friend_group_id').eq('list_group_id', group.id)
      .then(({ data }) => setFriendGroupShares((data ?? []).map(r => r.friend_group_id)))
  }, [group.id])

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file)
    setAvatarFile(compressed)
    setAvatarPreview(URL.createObjectURL(compressed))
  }


  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    let cover_url = avatarPreview === null ? null : group.cover_url
    if (avatarFile) {
      const path = `${userId}/list-${group.id}.jpg`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        cover_url = urlData.publicUrl
      }
    }

    let audio_url = removeAudio ? null : group.audio_url
    if (audioFile) {
      const ext = audioFile.name.split('.').pop()
      const path = `${userId}/list-audio-${group.id}.${ext}`
      const { error: aErr } = await supabase.storage.from('avatars').upload(path, audioFile, { upsert: true })
      if (!aErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        audio_url = urlData.publicUrl
      }
    }

    // Update shares
    await supabase.from('list_group_shares').delete().eq('list_group_id', group.id)
    if (visibility === 'groups' && friendGroupShares.length) {
      await supabase.from('list_group_shares').insert(
        friendGroupShares.map(fgId => ({ list_group_id: group.id, friend_group_id: fgId }))
      )
    }

    const { data } = await supabase.from('list_groups')
      .update({ name: name.trim(), description: description.trim() || null, visibility, cover_url, audio_url })
      .eq('id', group.id).select().single()
    setSaving(false)
    if (data) onSaved(data)
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${group.name}" and all its tasks? This cannot be undone.`)) return
    await supabase.from('list_groups').delete().eq('id', group.id)
    onDeleted()
  }

  return createPortal(
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card create-list-modal">
        <div className="modal-header">
          <h3>Edit list</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {/* Cover image */}
          <div className="modal-avatar-section">
            <div className="modal-avatar-btn"
              onClick={() => fileRef.current?.click()}
              style={{ background: avatarPreview ? 'transparent' : defaultGradient(group.id) }}>
              {avatarPreview
                ? <img src={avatarPreview} alt="cover" className="modal-avatar-img" />
                : <span className="modal-avatar-glyph">📋</span>
              }
              <div className="modal-avatar-hover">
                <span className="modal-avatar-camera">📷</span>
                <span className="modal-avatar-camera-label">{avatarPreview ? 'Change' : 'Add image'}</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
            {avatarPreview && (
              <button type="button" className="link-btn remove-avatar-btn"
                onClick={() => { setAvatarPreview(null); setAvatarFile(null) }}>
                Remove image
              </button>
            )}
          </div>

          <div className="field">
            <label>List name</label>
            <input className="modal-name-input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Description <span className="field-hint">— optional</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={280} placeholder="What's this list for?" />
          </div>

          <div className="field">
            <label>Who can see this list</label>
            <VisibilityPicker
              visibility={visibility} setVisibility={setVisibility}
              userId={userId}
              friendGroupShares={friendGroupShares} setFriendGroupShares={setFriendGroupShares}
              friendShares={friendShares} setFriendShares={setFriendShares}
            />
          </div>

          <div className="field">
            <label>Open sound <span className="field-hint">— plays when list is opened (max 10s)</span></label>
            <AudioFilePicker
              label=""
              audioFile={audioFile}
              audioName={audioName}
              onChange={(file) => { setAudioFile(file); setAudioName(file.name); setRemoveAudio(false) }}
              onRemove={() => { setAudioFile(null); setAudioName(null); setRemoveAudio(true) }}
            />
          </div>

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            </div>
            <button type="button" className="btn-danger" onClick={handleDelete}>Delete list</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}