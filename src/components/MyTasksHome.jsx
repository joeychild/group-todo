import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'

const VISIBILITY_ICONS  = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }
const VISIBILITY_LABELS = { private: 'Private', friends: 'Friends', groups: 'Groups', public: 'Public' }

function defaultGradient(seed = '') {
  const h1 = (((seed.charCodeAt(0) || 0) * 37) + ((seed.charCodeAt(1) || 0) * 13)) % 360
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
      fontSize: size * 0.46, userSelect: 'none',
    }}>
      {group.icon || '📋'}
    </div>
  )
}

export default function MyTasksHome({ listGroups, onSelectGroup, onTogglePin, onGroupCreated, userId }) {
  const [showModal, setShowModal] = useState(false)
  const visible = useFadeIn([listGroups.length])

  const pinned   = listGroups.filter(g => g.pinned)
  const unpinned = listGroups.filter(g => !g.pinned)

  return (
    <div className={`my-tasks-home ${visible ? 'fade-in' : ''}`}>
      {/* Page title row */}
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

      {/* Empty state */}
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
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            Create a list
          </button>
        </div>
      )}

      {/* Pinned */}
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
                onTogglePin={() => onTogglePin(group)} />
            ))}
          </div>
        </section>
      )}

      {/* Unpinned rows */}
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
                onTogglePin={() => onTogglePin(group)} />
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
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility]   = useState('private')
  const [avatarFile, setAvatarFile]   = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [saving, setSaving]           = useState(false)
  const fileRef = useRef()

  const gradientSeed = name.trim() || 'new'

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
      visibility,
      cover_url,
      position: 0,
      pinned: false,
    }).select().single()

    setSaving(false)
    if (data) onCreated(data)
  }

  return createPortal(
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card create-list-modal">
        <div className="modal-header">
          <h3>New list</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Avatar — large centered picker */}
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
            <input
              className="modal-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Work tasks, Groceries, Reading list…"
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
            <label>Who can see this list</label>
            <div className="vis-picker">
              {[
                { value: 'private', icon: '🔒', label: 'Private',  desc: 'Only you' },
                { value: 'friends', icon: '👥', label: 'Friends',  desc: 'Your friends can view and nudge' },
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
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-primary modal-submit-btn"
              disabled={saving || !name.trim()}>
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

// ── List card (pinned, larger box) ─────────────────────────────────────────
function ListCard({ group, index, onOpen, onTogglePin }) {
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
        {group.description && (
          <div className="list-card-desc">{group.description}</div>
        )}
        <button
          className="list-card-unpin-btn"
          onClick={e => { e.stopPropagation(); onTogglePin() }}
          title="Unpin"
        >
          Unpin
        </button>
      </div>
    </div>
  )
}

// ── List row (unpinned, compact iMessage-style) ────────────────────────────
function ListRow({ group, index, onOpen, onTogglePin }) {
  return (
    <li className="list-row" style={{ '--i': index }} onClick={onOpen}>
      <ListAvatar group={group} size={42} />
      <div className="list-row-info">
        <span className="list-row-name">{group.name}</span>
        <span className="list-row-sub">
          {group.description || VISIBILITY_LABELS[group.visibility]}
        </span>
      </div>
      <div className="list-row-right">
        <span className="list-row-vis">{VISIBILITY_ICONS[group.visibility]}</span>
        <button
          className="list-row-pin-btn"
          onClick={e => { e.stopPropagation(); onTogglePin() }}
          title="Pin"
        >
          📌
        </button>
      </div>
    </li>
  )
}