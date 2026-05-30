import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useNotifications } from '../context/NotificationContext'

const VISIBILITY_ICONS = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }

export default function Sidebar({ profile, listGroups, selectedGroup, onSelectGroup, onGroupsChange, currentView, onViewChange }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('📋')
  const [dragOver, setDragOver] = useState(null)
  const dragItem = useRef(null)
  const { unreadCount } = useNotifications()

  const createGroup = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const maxPos = listGroups.reduce((m, g) => Math.max(m, g.position), -1)
    const { data } = await supabase
      .from('list_groups')
      .insert({ owner_id: profile.id, name: newName.trim(), icon: newEmoji, position: maxPos + 1 })
      .select()
      .single()
    if (data) {
      onGroupsChange([...listGroups, data])
      onSelectGroup(data)
    }
    setCreating(false)
    setNewName('')
    setNewEmoji('📋')
  }

  // Drag-to-reorder
  const handleDragStart = (e, index) => {
    dragItem.current = index
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    setDragOver(index)
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    if (dragItem.current === null || dragItem.current === dropIndex) {
      setDragOver(null)
      return
    }
    const reordered = [...listGroups]
    const [moved] = reordered.splice(dragItem.current, 1)
    reordered.splice(dropIndex, 0, moved)
    const updated = reordered.map((g, i) => ({ ...g, position: i }))
    onGroupsChange(updated)
    setDragOver(null)
    dragItem.current = null

    // Persist new positions
    await Promise.all(updated.map(g =>
      supabase.from('list_groups').update({ position: g.position }).eq('id', g.id)
    ))
  }

  const navItems = [
    { id: 'my-todos', icon: '◈', label: 'My Tasks' },
    { id: 'friends', icon: '◉', label: 'Friends' },
    { id: 'notifications', icon: '◎', label: 'Notifications', badge: unreadCount },
    { id: 'settings', icon: '◌', label: 'Settings' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-profile" onClick={() => onViewChange('settings')}>
        <div className="sidebar-avatar">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" />
            : <span>{(profile.display_name || profile.username)[0].toUpperCase()}</span>
          }
        </div>
        <div className="sidebar-profile-info">
          <span className="sidebar-display-name">{profile.display_name || profile.username}</span>
          <span className="sidebar-username">@{profile.username}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${currentView === item.id && !selectedGroup ? 'active' : ''}`}
            onClick={() => { onViewChange(item.id); onSelectGroup(null) }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-section-header">
        <span>Lists</span>
        <button className="sidebar-add-btn" onClick={() => setCreating(true)} title="New list">+</button>
      </div>

      <div className="sidebar-groups">
        {listGroups.map((group, index) => (
          <div
            key={group.id}
            className={`sidebar-group-item ${selectedGroup?.id === group.id ? 'active' : ''} ${dragOver === index ? 'drag-over' : ''}`}
            draggable
            onDragStart={e => handleDragStart(e, index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragLeave={() => setDragOver(null)}
            onClick={() => { onSelectGroup(group); onViewChange('list') }}
          >
            <span className="group-icon">
              {group.cover_url
                ? <img src={group.cover_url} alt="" className="group-cover-thumb" />
                : group.icon || '📋'
              }
            </span>
            <span className="group-name">{group.name}</span>
            <span className="group-visibility" title={group.visibility}>
              {VISIBILITY_ICONS[group.visibility]}
            </span>
          </div>
        ))}

        {listGroups.length === 0 && !creating && (
          <p className="sidebar-empty">No lists yet</p>
        )}
      </div>

      {creating && (
        <form className="sidebar-new-group" onSubmit={createGroup}>
          <div className="new-group-row">
            <input
              className="emoji-input"
              value={newEmoji}
              onChange={e => setNewEmoji(e.target.value)}
              maxLength={2}
            />
            <input
              className="name-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="List name"
              autoFocus
            />
          </div>
          <div className="new-group-actions">
            <button type="submit" className="btn-primary-sm">Create</button>
            <button type="button" className="btn-ghost-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}
    </aside>
  )
}
