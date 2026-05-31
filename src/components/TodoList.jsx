import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'
import { useNotifications } from '../context/NotificationContext'
import { useAudio } from '../context/AudioContext'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: '🔒 Private', desc: 'Only you' },
  { value: 'friends', label: '👥 Friends', desc: 'All your friends' },
  { value: 'groups',  label: '🫂 Groups',  desc: 'Selected friend groups' },
  { value: 'public',  label: '🌐 Public',  desc: 'Anyone' },
]

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', color: '#e53e3e', bg: '#ffffff' },
  { value: 'in_progress', label: 'In Progress', color: '#d69e2e', bg: '#ffffff' },
  { value: 'paused',      label: 'Paused',      color: '#3182ce', bg: '#ffffff' },
  { value: 'done',        label: 'Done',        color: '#38a169', bg: '#ffffff' },
]

function statusForTodo(todo) {
  if (todo.is_complete) return STATUS_OPTIONS.find(s => s.value === 'done')
  return STATUS_OPTIONS.find(s => s.value === (todo.status || 'not_started')) || STATUS_OPTIONS[0]
}

function formatDueDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const isOverdue = d < now && !isNaN(d)
  const isToday = d.toDateString() === now.toDateString()
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString()

  let label
  if (isToday) {
    label = `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } else if (isTomorrow) {
    label = `Tomorrow at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } else {
    label = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return { label, isOverdue, isSoon: !isOverdue && (d - now) < 86400000 * 2 }
}

// ── Nudge tooltip (who nudged) ────────────────────────────────────────────
function NudgeTooltip({ todoId, count, myUserId, hasNudged, onNudge, onRemoveNudge }) {
  const [open, setOpen] = useState(false)
  const [nudgers, setNudgers] = useState([])
  const ref = useRef()

  const loadNudgers = async () => {
    const { data } = await supabase.from('nudges')
      .select('from_user_id, profile:profiles!nudges_from_user_id_fkey(username, display_name, avatar_url)')
      .eq('todo_id', todoId)
    setNudgers(data ?? [])
  }

  useEffect(() => {
    if (!open) return
    loadNudgers()
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="nudge-tooltip-wrap" ref={ref}>
      <span
        className="nudge-badge"
        onMouseEnter={() => { setOpen(true); loadNudgers() }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        👋 {count}
      </span>
      {open && (
        <div className="nudge-tooltip">
          <div className="nudge-tooltip-title">Nudged by</div>
          {nudgers.map(n => (
            <div key={n.from_user_id} className="nudge-tooltip-row">
              <div className="nudge-tooltip-avatar">
                {n.profile?.avatar_url
                  ? <img src={n.profile.avatar_url} alt="" />
                  : <span>{(n.profile?.display_name || n.profile?.username || '?')[0].toUpperCase()}</span>
                }
              </div>
              <span>{n.profile?.display_name || n.profile?.username || '?'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TodoList({ group, userId, onGroupUpdate, readOnly = false }) {
  const [todos, setTodos] = useState([])
  const [nudgeCounts, setNudgeCounts] = useState({}) // { todoId: count }
  const [nudgedByMe, setNudgedByMe] = useState(new Set()) // todoIds I've nudged
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newStatus, setNewStatus] = useState('not_started')
  const [loading, setLoading] = useState(true)
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [groupVisibility, setGroupVisibility] = useState(group.visibility)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(group.cover_url)
  const [dragOver, setDragOver] = useState(null)
  const [selectedTodo, setSelectedTodo] = useState(null)
  const [allGroups, setAllGroups] = useState([])
  const [friendGroups, setFriendGroups] = useState([])
  const [groupVisibilityShares, setGroupVisibilityShares] = useState([]) // which friend_group ids are selected
  const [showAddForm, setShowAddForm] = useState(false)
  const dragItem = useRef(null)
  const visible = useFadeIn([group.id])
  const { prefs, addCustomToast, markRead, notifications } = useNotifications()
  const { playNudge } = useAudio()

  // Clear task-related notifications when this list is opened
  useEffect(() => {
    const taskNotifIds = notifications
      .filter(n => !n.read && ['nudge', 'nudged_task_completed'].includes(n.type) && n.entity_id)
      .map(n => n.id)
    if (taskNotifIds.length > 0) taskNotifIds.forEach(id => markRead(id))
  }, [group.id])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: todosData } = await supabase.from('todos')
      .select('*').eq('group_id', group.id).order('position', { ascending: true })

    const ids = todosData?.map(t => t.id) ?? []
    let counts = {}
    let myNudges = new Set()
    if (ids.length) {
      const { data: allNudges } = await supabase.from('nudges')
        .select('todo_id, from_user_id').in('todo_id', ids)
      ;(allNudges ?? []).forEach(n => {
        counts[n.todo_id] = (counts[n.todo_id] || 0) + 1
        if (n.from_user_id === userId) myNudges.add(n.todo_id)
      })
    }

    setTodos(todosData ?? [])
    setNudgeCounts(counts)
    setNudgedByMe(myNudges)
    setLoading(false)
  }, [group.id, userId])

  useEffect(() => {
    setGroupName(group.name)
    setGroupVisibility(group.visibility)
    setCoverPreview(group.cover_url)
    fetchData()

    supabase.from('list_groups').select('id, name, icon').eq('owner_id', userId).neq('id', group.id)
      .then(({ data }) => setAllGroups(data ?? []))

    supabase.from('friend_groups').select('id, name').eq('owner_id', userId)
      .then(({ data }) => setFriendGroups(data ?? []))

    supabase.from('list_group_shares').select('friend_group_id').eq('list_group_id', group.id)
      .then(({ data }) => setGroupVisibilityShares((data ?? []).map(r => r.friend_group_id)))

    // Polling fallback instead of realtime (no paid plan needed)
    const pollInterval = setInterval(fetchData, 8000)
    return () => clearInterval(pollInterval)
  }, [group.id, fetchData])

  // Due date toast checker
  useEffect(() => {
    if (!prefs?.due_date) return
    const check = () => {
      const now = new Date()
      todos.forEach(todo => {
        if (!todo.due_date || todo.is_complete) return
        const due = new Date(todo.due_date)
        if (Math.abs(due - now) < 60000) addCustomToast?.(`⏰ "${todo.title}" is due now!`)
      })
    }
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [todos, prefs])

  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const maxPos = todos.reduce((m, t) => Math.max(m, t.position), -1)
    await supabase.from('todos').insert({
      user_id: userId, group_id: group.id,
      title: newTitle.trim(),
      position: maxPos + 1,
      status: newStatus,
      due_date: newDueDate || null,
    })
    setNewTitle(''); setNewDueDate(''); setNewStatus('not_started')
    setShowAddForm(false)
    fetchData()
  }

  const toggleTodo = async (todo) => {
    const newComplete = !todo.is_complete
    await supabase.from('todos').update({
      is_complete: newComplete,
      status: newComplete ? 'done' : (todo.status === 'done' ? 'not_started' : todo.status),
    }).eq('id', todo.id)

    if (newComplete && prefs?.nudged_task_completed) {
      // Get unique nudgers for this todo
      const { data: nudgers } = await supabase.from('nudges')
        .select('from_user_id').eq('todo_id', todo.id)
      const uniqueNudgers = [...new Set((nudgers ?? []).map(n => n.from_user_id).filter(Boolean))]
      await Promise.all(uniqueNudgers.map(nudgerId =>
        supabase.from('notifications').insert({
          user_id: nudgerId, from_user_id: userId, type: 'nudged_task_completed', entity_id: todo.id,
        })
      ))
    }
    fetchData()
  }

  const updateTodoField = async (todoId, fields) => {
    await supabase.from('todos').update(fields).eq('id', todoId)
    // Update local state immediately for responsiveness
    setTodos(prev => prev.map(t => t.id === todoId ? { ...t, ...fields } : t))
    setSelectedTodo(prev => prev?.id === todoId ? { ...prev, ...fields } : prev)
  }

  const deleteTodo = async (id) => {
    if (!confirm('Delete this task?')) return
    await supabase.from('todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
    if (selectedTodo?.id === id) setSelectedTodo(null)
  }

  const moveTodo = async (todoId, newGroupId) => {
    const { data } = await supabase.from('todos').select('position').eq('group_id', newGroupId)
      .order('position', { ascending: false }).limit(1)
    const maxPos = (data?.[0]?.position ?? -1) + 1
    await supabase.from('todos').update({ group_id: newGroupId, position: maxPos }).eq('id', todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
    setSelectedTodo(null)
  }

  // Toggle nudge — add if not nudged, remove if already nudged
  const handleNudge = async (todo, e) => {
    e?.stopPropagation()
    if (nudgedByMe.has(todo.id)) {
      // Remove nudge
      await supabase.from('nudges').delete().eq('todo_id', todo.id).eq('from_user_id', userId)
      setNudgedByMe(prev => { const s = new Set(prev); s.delete(todo.id); return s })
      setNudgeCounts(prev => ({ ...prev, [todo.id]: Math.max((prev[todo.id] || 1) - 1, 0) }))
    } else {
      // Add nudge
      await supabase.from('nudges').insert({ todo_id: todo.id, from_user_id: userId })
      // Send notification to list owner
      if (group.owner_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: group.owner_id, from_user_id: userId, type: 'nudge', entity_id: todo.id,
        })
      }
      setNudgedByMe(prev => new Set([...prev, todo.id]))
      setNudgeCounts(prev => ({ ...prev, [todo.id]: (prev[todo.id] || 0) + 1 }))
      playNudge()
    }
  }

  const handleDragStart = (e, index) => { dragItem.current = index; e.dataTransfer.effectAllowed = 'move' }
  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    if (dragItem.current === null || dragItem.current === dropIndex) { setDragOver(null); return }
    const reordered = [...todos]
    const [moved] = reordered.splice(dragItem.current, 1)
    reordered.splice(dropIndex, 0, moved)
    const updated = reordered.map((t, i) => ({ ...t, position: i }))
    setTodos(updated); setDragOver(null); dragItem.current = null
    await Promise.all(updated.map(t => supabase.from('todos').update({ position: t.position }).eq('id', t.id)))
  }

  const handleCoverChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCoverFile(file); setCoverPreview(URL.createObjectURL(file))
  }

  const saveGroupSettings = async () => {
    let cover_url = group.cover_url
    if (coverFile) {
      const ext = coverFile.name.split('.').pop()
      const path = `${userId}/${group.id}.${ext}`
      await supabase.storage.from('avatars').upload(path, coverFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      cover_url = urlData.publicUrl
    }
    // Sync group-visibility shares
    if (groupVisibility === 'groups') {
      await supabase.from('list_group_shares').delete().eq('list_group_id', group.id)
      if (groupVisibilityShares.length) {
        await supabase.from('list_group_shares').insert(
          groupVisibilityShares.map(fgId => ({ list_group_id: group.id, friend_group_id: fgId }))
        )
      }
    }
    const { data } = await supabase.from('list_groups')
      .update({ name: groupName, visibility: groupVisibility, cover_url })
      .eq('id', group.id).select().single()
    if (data) onGroupUpdate(data)
    setEditingGroup(false)
  }

  const deleteGroup = async () => {
    if (!confirm(`Delete "${group.name}" and all its tasks? This cannot be undone.`)) return
    await supabase.from('list_groups').delete().eq('id', group.id)
    onGroupUpdate(null)
  }

  if (loading) return <div className="page-loading">Loading…</div>

  return (
    <div className={`todo-page-wrapper ${selectedTodo ? 'with-detail' : ''}`}>
      <div className={`todo-page ${visible ? 'fade-in' : ''}`}>
        {/* Group header */}
        <div className="todo-header">
          {coverPreview && !editingGroup && (
            <div className="todo-cover" style={{ backgroundImage: `url(${coverPreview})` }} />
          )}
          <div className="todo-header-content">
            {editingGroup ? (
              <GroupEditForm
                groupName={groupName} setGroupName={setGroupName}
                groupVisibility={groupVisibility} setGroupVisibility={setGroupVisibility}
                coverPreview={coverPreview} setCoverPreview={setCoverPreview} setCoverFile={setCoverFile}
                handleCoverChange={handleCoverChange}
                friendGroups={friendGroups}
                groupVisibilityShares={groupVisibilityShares} setGroupVisibilityShares={setGroupVisibilityShares}
                onSave={saveGroupSettings} onCancel={() => setEditingGroup(false)} onDelete={deleteGroup}
              />
            ) : (
              <div className="group-title-row">
                <span className="group-title-icon">{group.cover_url ? '' : (group.icon || '📋')}</span>
                <div className="group-title-text">
                  <h2 className="group-title">{group.name}</h2>
                  {group.description && <p className="group-description">{group.description}</p>}
                </div>
                <span className="group-vis-pill">
                  {VISIBILITY_OPTIONS.find(o => o.value === group.visibility)?.label}
                </span>
                {!readOnly && (
                  <button className="icon-btn" onClick={() => setEditingGroup(true)} title="Edit list">⚙</button>
                )}
                {readOnly && group._friendProfile && (
                  <span className="readonly-badge">
                    👤 {group._friendProfile.display_name || group._friendProfile.username}'s list
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {!editingGroup && (
          <>
            {!readOnly && (
              <div className="add-todo-section">
                {!showAddForm ? (
                  <button className="add-todo-trigger" onClick={() => setShowAddForm(true)}>
                    + Add task
                  </button>
                ) : (
                  <form onSubmit={addTodo} className="add-todo-form-expanded">
                    <input
                      className="add-todo-title-input"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="Task name…"
                      autoFocus
                    />
                    <div className="add-todo-meta-row">
                      <label className="add-todo-meta-item" title="Due date">
                        📅
                        <input
                          type="datetime-local"
                          value={newDueDate}
                          onChange={e => setNewDueDate(e.target.value)}
                          className="add-todo-date-input"
                        />
                        {newDueDate
                          ? <span className="add-todo-meta-value">
                              {new Date(newDueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          : <span className="add-todo-meta-value muted">Due date</span>
                        }
                      </label>
                      <div className="add-todo-meta-item">
                        <select
                          value={newStatus}
                          onChange={e => setNewStatus(e.target.value)}
                          className="add-todo-status-select"
                          style={{ color: STATUS_OPTIONS.find(s => s.value === newStatus)?.color }}
                        >
                          {STATUS_OPTIONS.filter(s => s.value !== 'done').map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="add-todo-actions">
                      <button type="submit" className="btn-primary-sm" disabled={!newTitle.trim()}>Add task</button>
                      <button type="button" className="btn-ghost-sm"
                        onClick={() => { setShowAddForm(false); setNewTitle(''); setNewDueDate(''); setNewStatus('not_started') }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <ul className="todo-list">
              {todos.map((todo, index) => {
                const st = statusForTodo(todo)
                const due = formatDueDate(todo.due_date)
                const count = nudgeCounts[todo.id] || 0
                return (
                  <li
                    key={todo.id}
                    className={`todo-item ${todo.is_complete ? 'complete' : ''} ${!readOnly && dragOver === index ? 'drag-over' : ''} ${selectedTodo?.id === todo.id ? 'todo-item-selected' : ''}`}
                    draggable={!readOnly}
                    onDragStart={!readOnly ? e => handleDragStart(e, index) : undefined}
                    onDragOver={!readOnly ? e => { e.preventDefault(); setDragOver(index) } : undefined}
                    onDrop={!readOnly ? e => handleDrop(e, index) : undefined}
                    onDragLeave={!readOnly ? () => setDragOver(null) : undefined}
                    style={{ '--i': index }}
                    onClick={() => setSelectedTodo(selectedTodo?.id === todo.id ? null : todo)}
                  >
                    {!readOnly && <span className="drag-handle" onClick={e => e.stopPropagation()}>⠿</span>}
                    {!readOnly && (
                      <input type="checkbox" checked={todo.is_complete}
                        onClick={e => e.stopPropagation()} onChange={() => toggleTodo(todo)} />
                    )}

                    <div className="todo-main">
                      <span className="todo-title">{todo.title}</span>
                      {todo.description && <span className="todo-sub">{todo.description}</span>}
                      {due && (
                        <span className={`todo-due ${due.isOverdue ? 'overdue' : due.isSoon ? 'due-soon' : ''}`}>
                          📅 {due.label}
                        </span>
                      )}
                    </div>

                    {!todo.is_complete && (
                      <span className="todo-status-pill"
                        style={{ color: st.color, background: st.bg }}
                        onClick={e => e.stopPropagation()}>
                        {st.label}
                      </span>
                    )}

                    {count > 0 && (
                      <NudgeTooltip
                        todoId={todo.id}
                        count={count}
                        myUserId={userId}
                        hasNudged={nudgedByMe.has(todo.id)}
                        onNudge={() => handleNudge(todo)}
                        onRemoveNudge={() => handleNudge(todo)}
                      />
                    )}

                    {readOnly && (
                      <button
                        className={`nudge-btn ${nudgedByMe.has(todo.id) ? 'nudged' : ''}`}
                        onClick={e => handleNudge(todo, e)}
                      >
                        {nudgedByMe.has(todo.id) ? '👋 Nudged' : '👋 Nudge'}
                      </button>
                    )}
                  </li>
                )
              })}
              {todos.length === 0 && (
                <li className="todo-empty">{readOnly ? 'All caught up 🎉' : 'No tasks yet — add one above.'}</li>
              )}
            </ul>
          </>
        )}
      </div>

      {selectedTodo && !editingGroup && (
        <TaskDetailPanel
          key={selectedTodo.id}
          todo={selectedTodo}
          readOnly={readOnly}
          allGroups={allGroups}
          onClose={() => setSelectedTodo(null)}
          onUpdate={updateTodoField}
          onDelete={deleteTodo}
          onMove={moveTodo}
          onToggle={toggleTodo}
        />
      )}
    </div>
  )
}

// ── Group edit form ─────────────────────────────────────────────────────────
function GroupEditForm({ groupName, setGroupName, groupVisibility, setGroupVisibility,
  coverPreview, setCoverPreview, setCoverFile, handleCoverChange,
  friendGroups, groupVisibilityShares, setGroupVisibilityShares,
  onSave, onCancel, onDelete }) {

  const [showGroupPicker, setShowGroupPicker] = useState(false)

  const toggleShare = (id) => {
    setGroupVisibilityShares(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="group-edit-form">
      <div className="cover-upload-area">
        {coverPreview
          ? <img src={coverPreview} alt="cover" className="cover-preview" />
          : <div className="cover-placeholder">No cover</div>
        }
        <label className="cover-upload-btn">
          {coverPreview ? 'Change cover' : 'Add cover'}
          <input type="file" accept="image/*" onChange={handleCoverChange} hidden />
        </label>
        {coverPreview && (
          <button className="btn-ghost-sm" onClick={() => { setCoverPreview(null); setCoverFile(null) }}>Remove</button>
        )}
      </div>

      <div className="group-edit-row">
        <input className="group-name-input" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="List name" autoFocus />
      </div>

      <div className="visibility-picker">
        {VISIBILITY_OPTIONS.map(opt => (
          <button key={opt.value}
            className={`visibility-opt ${groupVisibility === opt.value ? 'active' : ''}`}
            onClick={() => { setGroupVisibility(opt.value); if (opt.value === 'groups') setShowGroupPicker(true) }}>
            <span>{opt.label}</span>
            <span className="vis-desc">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Friend group selector for 'groups' visibility */}
      {groupVisibility === 'groups' && (
        <div className="friend-group-share-picker">
          <div className="fgs-header">
            <span className="fgs-label">Visible to these friend groups:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost-sm" onClick={() => setGroupVisibilityShares(friendGroups.map(g => g.id))}>All</button>
              <button className="btn-ghost-sm" onClick={() => setGroupVisibilityShares([])}>None</button>
            </div>
          </div>
          {friendGroups.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text-light)' }}>No friend groups yet. Create some in Friends → Groups.</p>
            : friendGroups.map(fg => (
                <label key={fg.id} className="fgs-row">
                  <input type="checkbox" checked={groupVisibilityShares.includes(fg.id)}
                    onChange={() => toggleShare(fg.id)} />
                  <span>{fg.name}</span>
                </label>
              ))
          }
        </div>
      )}

      <div className="group-edit-actions">
        <button className="btn-primary" onClick={onSave}>Save changes</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-danger" onClick={onDelete}>Delete list</button>
      </div>
    </div>
  )
}

// ── Task Detail Panel (right drawer) ────────────────────────────────────────
function TaskDetailPanel({ todo, readOnly, allGroups, onClose, onUpdate, onDelete, onMove, onToggle }) {
  const [title, setTitle] = useState(todo.title)
  const [description, setDescription] = useState(todo.description || '')
  const [notes, setNotes] = useState(todo.notes || '')
  const [dueDate, setDueDate] = useState(todo.due_date ? todo.due_date.slice(0, 16) : '')
  const [status, setStatus] = useState(todo.status || 'not_started')
  const [saving, setSaving] = useState(false)
  const [moveTarget, setMoveTarget] = useState('')

  useEffect(() => {
    setTitle(todo.title)
    setDescription(todo.description || '')
    setNotes(todo.notes || '')
    setDueDate(todo.due_date ? todo.due_date.slice(0, 16) : '')
    setStatus(todo.is_complete ? 'done' : (todo.status || 'not_started'))
  }, [todo.id, todo.title, todo.due_date, todo.status, todo.is_complete])

  const save = async () => {
    setSaving(true)
    await onUpdate(todo.id, {
      title: title.trim(),
      description: description.trim() || null,
      notes: notes.trim() || null,
      due_date: dueDate || null,
      status: todo.is_complete ? 'done' : status,
    })
    setSaving(false)
  }

  const handleStatusChange = async (newStatus) => {
    setStatus(newStatus)
    await onUpdate(todo.id, { status: newStatus })
  }

  const due = formatDueDate(dueDate)

  return (
    <div className="task-detail-panel">
      <div className="task-detail-header">
        <div className="task-detail-header-left">
          {!readOnly && (
            <input type="checkbox" checked={todo.is_complete}
              onChange={() => onToggle(todo)} className="task-detail-check" />
          )}
          <span className="task-detail-title-label">Task Details</span>
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="task-detail-body">
        <div className="task-detail-field">
          <label className="task-detail-label">Title</label>
          {readOnly
            ? <p className="task-detail-value">{title}</p>
            : <input value={title} onChange={e => setTitle(e.target.value)} className="task-detail-input" />
          }
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Description</label>
          {readOnly
            ? <p className="task-detail-value">{description || '—'}</p>
            : <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="task-detail-input" rows={3} placeholder="Add a description…" />
          }
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Notes</label>
          {readOnly
            ? <p className="task-detail-value">{notes || '—'}</p>
            : <textarea value={notes} onChange={e => setNotes(e.target.value)}
                className="task-detail-input" rows={2} placeholder="Add notes…" />
          }
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Due Date</label>
          {readOnly
            ? <p className={`task-detail-value ${due?.isOverdue ? 'overdue' : ''}`}>
                {dueDate ? new Date(dueDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            : (
              <div className="task-detail-due-row">
                <input type="datetime-local" value={dueDate}
                  onChange={e => setDueDate(e.target.value)} className="task-detail-input" />
                {dueDate && (
                  <button className="task-detail-clear-btn" onClick={() => setDueDate('')} title="Clear">✕</button>
                )}
              </div>
            )
          }
          {due && !readOnly && (
            <span className={`task-detail-due-preview ${due.isOverdue ? 'overdue' : ''}`}>
              {due.label}
            </span>
          )}
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Status</label>
          <div className="task-detail-status-row">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value}
                disabled={readOnly || todo.is_complete}
                className={`task-status-btn ${(status === opt.value || (todo.is_complete && opt.value === 'done')) ? 'active' : ''}`}
                style={{ '--st-color': opt.color, '--st-bg': opt.bg }}
                onClick={() => !readOnly && !todo.is_complete && handleStatusChange(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!readOnly && allGroups.length > 0 && (
          <div className="task-detail-field">
            <label className="task-detail-label">Move to list</label>
            <div className="task-detail-move-row">
              <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} className="task-detail-input">
                <option value="">Select a list…</option>
                {allGroups.map(g => <option key={g.id} value={g.id}>{g.icon || '📋'} {g.name}</option>)}
              </select>
              <button className="btn-primary-sm" disabled={!moveTarget}
                onClick={() => moveTarget && onMove(todo.id, moveTarget)}>
                Move
              </button>
            </div>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="task-detail-footer">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn-danger" onClick={() => onDelete(todo.id)}>Delete</button>
        </div>
      )}
    </div>
  )
}