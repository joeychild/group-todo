import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'

const VISIBILITY_ICONS = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }

export default function MyTasksPanel({ profile, listGroups, onGroupsChange, onSelectGroup }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('📋')
  const [dragOver, setDragOver] = useState(null)
  const dragItem = useRef(null)
  const visible = useFadeIn([listGroups.length])

  const pinnedLists = listGroups.filter(g => g.pinned)
  const unpinnedLists = listGroups.filter(g => !g.pinned)

  const createGroup = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const maxPos = listGroups.reduce((m, g) => Math.max(m, g.position), -1)
    const { data } = await supabase
      .from('list_groups')
      .insert({
        owner_id: profile.id,
        name: newName.trim(),
        icon: newEmoji,
        position: maxPos + 1,
        pinned: false,
      })
      .select()
      .single()
    if (data) onGroupsChange([...listGroups, data])
    setCreating(false)
    setNewName('')
    setNewEmoji('📋')
  }

  const togglePin = async (e, group) => {
    e.stopPropagation()
    const { data } = await supabase
      .from('list_groups')
      .update({ pinned: !group.pinned })
      .eq('id', group.id)
      .select()
      .single()
    if (data) onGroupsChange(listGroups.map(g => g.id === data.id ? data : g))
  }

  // Drag reorder for unpinned list
  const handleDragStart = (e, index) => {
    dragItem.current = index
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    if (dragItem.current === null || dragItem.current === dropIndex) {
      setDragOver(null)
      return
    }
    const reordered = [...unpinnedLists]
    const [moved] = reordered.splice(dragItem.current, 1)
    reordered.splice(dropIndex, 0, moved)
    // Merge back with pinned
    const merged = [...pinnedLists, ...reordered].map((g, i) => ({ ...g, position: i }))
    onGroupsChange(merged)
    setDragOver(null)
    dragItem.current = null
    await Promise.all(merged.map(g =>
      supabase.from('list_groups').update({ position: g.position }).eq('id', g.id)
    ))
  }

  return (
    <div className={`page my-tasks-page ${visible ? 'fade-in' : ''}`}>
      <div className="my-tasks-header">
        <h2>My Tasks</h2>
        <button className="my-tasks-add-btn" onClick={() => setCreating(true)} title="New list">
          <span>+</span> New list
        </button>
      </div>

      {creating && (
        <form className="new-list-form" onSubmit={createGroup}>
          <div className="new-list-form-row">
            <input
              className="emoji-input"
              value={newEmoji}
              onChange={e => setNewEmoji(e.target.value)}
              maxLength={2}
              style={{ width: 40 }}
            />
            <input
              className="new-list-name-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="List name…"
              autoFocus
            />
          </div>
          <div className="new-list-form-actions">
            <button type="submit" className="btn-primary-sm">Create</button>
            <button type="button" className="btn-ghost-sm" onClick={() => { setCreating(false); setNewName(''); setNewEmoji('📋') }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {listGroups.length === 0 && !creating && (
        <div className="empty-state-card">
          <div className="empty-icon">✦</div>
          <h3>No lists yet</h3>
          <p>Create your first list using the button above.</p>
        </div>
      )}

      {/* Pinned lists — large cards */}
      {pinnedLists.length > 0 && (
        <section className="pinned-section">
          <div className="lists-section-label">Pinned</div>
          <div className="pinned-grid">
            {pinnedLists.map(group => (
              <div
                key={group.id}
                className="pinned-card"
                onClick={() => onSelectGroup(group)}
              >
                {group.cover_url && (
                  <div
                    className="pinned-card-cover"
                    style={{ backgroundImage: `url(${group.cover_url})` }}
                  />
                )}
                <div className="pinned-card-body">
                  <div className="pinned-card-icon">
                    {group.cover_url
                      ? null
                      : group.icon || '📋'}
                  </div>
                  <div className="pinned-card-name">{group.name}</div>
                  <div className="pinned-card-meta">
                    <span className="pinned-card-vis">{VISIBILITY_ICONS[group.visibility]}</span>
                  </div>
                </div>
                <button
                  className="pin-btn pin-btn-active"
                  onClick={(e) => togglePin(e, group)}
                  title="Unpin"
                >
                  📌
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unpinned lists — compact iMessage-style rows */}
      {unpinnedLists.length > 0 && (
        <section className="unpinned-section">
          {pinnedLists.length > 0 && (
            <div className="lists-section-label">Lists</div>
          )}
          <ul className="unpinned-list">
            {unpinnedLists.map((group, index) => (
              <li
                key={group.id}
                className={`unpinned-item ${dragOver === index ? 'drag-over' : ''}`}
                draggable
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => { e.preventDefault(); setDragOver(index) }}
                onDrop={e => handleDrop(e, index)}
                onDragLeave={() => setDragOver(null)}
                onClick={() => onSelectGroup(group)}
              >
                <div className="unpinned-drag-handle">⠿</div>
                <div className="unpinned-icon">
                  {group.cover_url
                    ? <img src={group.cover_url} alt="" className="unpinned-cover-thumb" />
                    : <span>{group.icon || '📋'}</span>
                  }
                </div>
                <div className="unpinned-info">
                  <span className="unpinned-name">{group.name}</span>
                  <span className="unpinned-vis">{VISIBILITY_ICONS[group.visibility]}</span>
                </div>
                <button
                  className="pin-btn"
                  onClick={(e) => togglePin(e, group)}
                  title="Pin list"
                >
                  📌
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
