import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'

const VISIBILITY_ICONS = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }

// Deterministic pastel gradient for default list avatar
function defaultGradient(seed = '') {
  const h1 = ((seed.charCodeAt(0) || 0) * 37 + (seed.charCodeAt(1) || 0) * 13) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
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
      fontSize: size * 0.46,
    }}>
      {group.icon || '📋'}
    </div>
  )
}

export default function MyTasksHome({ listGroups, onSelectGroup, onTogglePin, onGroupCreated, userId }) {
  const [showModal, setShowModal] = useState(false)
  const visible = useFadeIn([listGroups.length])

  const pinned = listGroups.filter(g => g.pinned)
  const unpinned = listGroups.filter(g => !g.pinned)

  return (
    <div className={`my-tasks-home ${visible ? 'fade-in' : ''}`}>
      <div className="tasks-home-header">
        <h2>My Tasks</h2>
        <button className="btn-create-list" onClick={() => setShowModal(true)}>+ New list</button>
      </div>

      {listGroups.length === 0 && (
        <div className="empty-state-card">
          <div className="empty-icon">✦</div>
          <h3>No lists yet</h3>
          <p>Create your first list to get started.</p>
        </div>
      )}

      {pinned.length > 0 && (
        <section className="lists-section">
          <h3 className="lists-section-label">Pinned</h3>
          <div className="pinned-grid">
            {pinned.map((group, i) => (
              <ListCard key={group.id} group={group} index={i}
                onOpen={() => onSelectGroup(group)} onTogglePin={() => onTogglePin(group)} />
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section className="lists-section">
          {pinned.length > 0 && <h3 className="lists-section-label">All lists</h3>}
          <ul className="list-rows">
            {unpinned.map((group, i) => (
              <ListRow key={group.id} group={group} index={i}
                onOpen={() => onSelectGroup(group)} onTogglePin={() => onTogglePin(group)} />
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
    </div>
  )
}

// ── Create list modal ──────────────────────────────────────────────────────
function CreateListModal({ userId, onCreated, onClose }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('📋')
  const [visibility, setVisibility] = useState('private')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  // Seed for default gradient preview
  const gradientSeed = name || 'new'

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    let cover_url = null

    if (avatarFile) {
      // Upload to storage under user's folder
      const ext = avatarFile.name.split('.').pop()
      const path = `${userId}/list-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        cover_url = urlData.publicUrl
      }
    }

    const { data } = await supabase.from('list_groups').insert({
      owner_id: userId,
      name: name.trim(),
      description: description.trim() || null,
      icon: emoji,
      visibility,
      cover_url,
      position: 0,
      pinned: false,
    }).select().single()

    setSaving(false)
    if (data) onCreated(data)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card create-list-modal">
        <div className="modal-header">
          <h3>New list</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Avatar picker */}
          <div className="modal-avatar-row">
            <div
              className="modal-avatar-preview"
              onClick={() => fileRef.current?.click()}
              title="Click to upload an image"
              style={{
                background: avatarPreview ? undefined : defaultGradient(gradientSeed),
              }}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="cover" />
                : <span className="modal-avatar-emoji">{emoji}</span>
              }
              <div className="modal-avatar-overlay">
                <span>📷</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
            <div className="modal-avatar-info">
              <p className="modal-avatar-hint">Click the image to upload a custom avatar.</p>
              {avatarPreview && (
                <button type="button" className="btn-ghost-sm"
                  onClick={() => { setAvatarPreview(null); setAvatarFile(null) }}>
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Emoji + Name */}
          <div className="modal-name-row">
            <input
              className="emoji-input"
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              maxLength={2}
              title="Icon (emoji)"
            />
            <input
              className="modal-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="List name…"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="field">
            <label>Description <span className="field-hint">— optional</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this list for?"
              rows={2}
              maxLength={280}
            />
          </div>

          {/* Visibility */}
          <div className="field">
            <label>Visibility</label>
            <div className="visibility-mini-picker">
              {[
                { value: 'private', label: '🔒 Private', desc: 'Only you' },
                { value: 'friends', label: '👥 Friends', desc: 'Your friends' },
                { value: 'public',  label: '🌐 Public',  desc: 'Anyone' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  className={`vis-chip ${visibility === opt.value ? 'active' : ''}`}
                  onClick={() => setVisibility(opt.value)}
                >
                  <span>{opt.label}</span>
                  <span className="vis-chip-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create list'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── List card (pinned) ─────────────────────────────────────────────────────
function ListCard({ group, index, onOpen, onTogglePin }) {
  return (
    <div className="list-card" style={{ '--i': index }} onClick={onOpen}>
      {group.cover_url
        ? <img src={group.cover_url} alt="" className="list-card-bg-img" />
        : <div className="list-card-bg-gradient" style={{ background: defaultGradient(group.id) }} />
      }
      <div className="list-card-overlay" />
      <div className="list-card-content">
        <div className="list-card-icon">{group.icon || '📋'}</div>
        <div className="list-card-name">{group.name}</div>
        {group.description && <div className="list-card-desc">{group.description}</div>}
        <div className="list-card-footer">
          <span className="list-card-vis">{VISIBILITY_ICONS[group.visibility]}</span>
          <button className="list-card-pin-btn" onClick={e => { e.stopPropagation(); onTogglePin() }} title="Unpin">
            📌
          </button>
        </div>
      </div>
    </div>
  )
}

// ── List row (unpinned) ────────────────────────────────────────────────────
function ListRow({ group, index, onOpen, onTogglePin }) {
  return (
    <li className="list-row" style={{ '--i': index }} onClick={onOpen}>
      <ListAvatar group={group} size={38} />
      <div className="list-row-info">
        <span className="list-row-name">{group.name}</span>
        {group.description && <span className="list-row-desc">{group.description}</span>}
      </div>
      <span className="list-row-vis">{VISIBILITY_ICONS[group.visibility]}</span>
      <button className="list-row-pin-btn" onClick={e => { e.stopPropagation(); onTogglePin() }} title="Pin">
        📌
      </button>
    </li>
  )
}
