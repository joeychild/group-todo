import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'
import { useNotifications } from '../context/NotificationContext'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: '🔒 Private', desc: 'Only you' },
  { value: 'friends', label: '👥 Friends', desc: 'All your friends' },
  { value: 'groups', label: '🫂 Groups', desc: 'Selected friend groups' },
  { value: 'public', label: '🌐 Public', desc: 'Anyone' },
]

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', color: '#e53e3e', bg: '#fff5f5' },
  { value: 'in_progress', label: 'In Progress', color: '#d69e2e', bg: '#fffff0' },
  { value: 'paused',      label: 'Paused',      color: '#3182ce', bg: '#ebf8ff' },
  { value: 'done',        label: 'Done',         color: '#38a169', bg: '#f0fff4' },
]

function statusForTodo(todo) {
  if (todo.is_complete) return STATUS_OPTIONS.find(s => s.value === 'done')
  return STATUS_OPTIONS.find(s => s.value === (todo.status || 'not_started')) || STATUS_OPTIONS[0]
}

function formatDueDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((due - today) / 86400000)
  if (diff === 0) return { label: 'Due today', overdue: false, soon: true }
  if (diff === 1) return { label: 'Due tomorrow', overdue: false, soon: true }
  if (diff < 0) return { label: `Overdue by ${Math.abs(diff)}d`, overdue: true, soon: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false, soon: false }
}

export default function TodoList({ group, userId, onGroupUpdate, readOnly = false }) {
  const [todos, setTodos] = useState([])
  const [nudges, setNudges] = useState([])
  const [nudgedIds, setNudgedIds] = useState(new Set())
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [groupIcon, setGroupIcon] = useState(group.icon || '📋')
  const [groupVisibility, setGroupVisibility] = useState(group.visibility)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(group.cover_url)
  const [dragOver, setDragOver] = useState(null)
  const [selectedTodo, setSelectedTodo] = useState(null) // detail panel
  const [allGroups, setAllGroups] = useState([]) // for move-to
  const dragItem = useRef(null)
  const visible = useFadeIn([group.id])
  const { prefs, addCustomToast } = useNotifications()

  useEffect(() => {
    setGroupName(group.name)
    setGroupIcon(group.icon || '📋')
    setGroupVisibility(group.visibility)
    setCoverPreview(group.cover_url)

    const fetchData = async () => {
      setLoading(true)
      const [{ data: todosData }, { data: nudgesData }] = await Promise.all([
        supabase.from('todos').select('*').eq('group_id', group.id).order('position', { ascending: true }),
        supabase.from('nudges').select('todo_id'),
      ])
      setTodos(todosData ?? [])
      setNudges(nudgesData ?? [])
      setLoading(false)
    }
    fetchData()

    // Fetch other groups for "move to" dropdown
    supabase.from('list_groups').select('id, name, icon')
      .eq('owner_id', userId).neq('id', group.id)
      .then(({ data }) => setAllGroups(data ?? []))

    const todoSub = supabase.channel('todos-' + group.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `group_id=eq.${group.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTodos(prev => [...prev, payload.new].sort((a, b) => a.position - b.position))
          } else if (payload.eventType === 'UPDATE') {
            setTodos(prev => prev.map(t => t.id === payload.new.id ? payload.new : t).sort((a, b) => a.position - b.position))
            // If the selected todo was updated, refresh it
            setSelectedTodo(prev => prev?.id === payload.new.id ? { ...prev, ...payload.new } : prev)
          } else if (payload.eventType === 'DELETE') {
            setTodos(prev => prev.filter(t => t.id !== payload.old.id))
            setSelectedTodo(prev => prev?.id === payload.old.id ? null : prev)
          }
        }
      )
      .subscribe()

    const nudgeSub = supabase.channel('nudges-' + group.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges' },
        (payload) => setNudges(prev => [...prev, payload.new])
      )
      .subscribe()

    return () => { supabase.removeChannel(todoSub); supabase.removeChannel(nudgeSub) }
  }, [group.id])

  // Due date toast checker
  useEffect(() => {
    if (!prefs?.due_date) return
    const check = () => {
      const now = new Date()
      todos.forEach(todo => {
        if (!todo.due_date || todo.is_complete) return
        const due = new Date(todo.due_date)
        const diff = Math.abs(due - now)
        if (diff < 60000) { // within 1 minute of due
          addCustomToast?.(`⏰ "${todo.title}" is due now!`)
        }
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
      user_id: userId,
      group_id: group.id,
      title: newTitle.trim(),
      position: maxPos + 1,
      status: 'not_started',
    })
    setNewTitle('')
  }

  const toggleTodo = async (todo) => {
    const wasComplete = todo.is_complete
    const newComplete = !wasComplete
    await supabase.from('todos').update({
      is_complete: newComplete,
      status: newComplete ? 'done' : 'not_started',
    }).eq('id', todo.id)

    // If just completed: notify anyone who nudged this todo
    if (newComplete && prefs?.nudged_task_completed) {
      const nudgersForTodo = nudges
        .filter(n => n.todo_id === todo.id)
        .map(n => n.from_user_id)
        .filter(Boolean)
      const uniqueNudgers = [...new Set(nudgersForTodo)]
      await Promise.all(uniqueNudgers.map(nudgerId =>
        supabase.from('notifications').insert({
          user_id: nudgerId,
          from_user_id: userId,
          type: 'nudged_task_completed',
          entity_id: todo.id,
        })
      ))
    }
  }

  const updateTodoField = async (todoId, fields) => {
    await supabase.from('todos').update(fields).eq('id', todoId)
  }

  const deleteTodo = async (id) => {
    if (!confirm('Delete this task?')) return
    await supabase.from('todos').delete().eq('id', id)
    if (selectedTodo?.id === id) setSelectedTodo(null)
  }

  const moveTodo = async (todoId, newGroupId) => {
    const maxPos = await supabase.from('todos').select('position').eq('group_id', newGroupId)
      .order('position', { ascending: false }).limit(1)
      .then(({ data }) => (data?.[0]?.position ?? -1) + 1)
    await supabase.from('todos').update({ group_id: newGroupId, position: maxPos }).eq('id', todoId)
    setSelectedTodo(null)
  }

  const handleDragStart = (e, index) => { dragItem.current = index; e.dataTransfer.effectAllowed = 'move' }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    if (dragItem.current === null || dragItem.current === dropIndex) { setDragOver(null); return }
    const reordered = [...todos]
    const [moved] = reordered.splice(dragItem.current, 1)
    reordered.splice(dropIndex, 0, moved)
    const updated = reordered.map((t, i) => ({ ...t, position: i }))
    setTodos(updated)
    setDragOver(null)
    dragItem.current = null
    await Promise.all(updated.map(t => supabase.from('todos').update({ position: t.position }).eq('id', t.id)))
  }

  const handleCoverChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
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
    const { data } = await supabase.from('list_groups')
      .update({ name: groupName, icon: groupIcon, visibility: groupVisibility, cover_url })
      .eq('id', group.id).select().single()
    if (data) onGroupUpdate(data)
    setEditingGroup(false)
  }

  const deleteGroup = async () => {
    if (!confirm(`Delete "${group.name}" and all its tasks? This cannot be undone.`)) return
    await supabase.from('list_groups').delete().eq('id', group.id)
    onGroupUpdate(null)
  }

  const nudgeCount = (todoId) => nudges.filter(n => n.todo_id === todoId).length

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
              <div className="group-edit-form">
                <div className="cover-upload-area">
                  {coverPreview
                    ? <img src={coverPreview} alt="cover" className="cover-preview" />
                    : <div className="cover-placeholder">No cover image</div>
                  }
                  <label className="cover-upload-btn">
                    {coverPreview ? 'Change cover' : 'Add cover'}
                    <input type="file" accept="image/*" onChange={handleCoverChange} hidden />
                  </label>
                  {coverPreview && (
                    <button className="btn-ghost-sm" onClick={() => { setCoverPreview(null); setCoverFile(null) }}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="group-edit-row">
                  <input className="emoji-input-lg" value={groupIcon} onChange={e => setGroupIcon(e.target.value)} maxLength={2} />
                  <input className="group-name-input" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="List name" autoFocus />
                </div>
                <div className="visibility-picker">
                  {VISIBILITY_OPTIONS.map(opt => (
                    <button key={opt.value}
                      className={`visibility-opt ${groupVisibility === opt.value ? 'active' : ''}`}
                      onClick={() => setGroupVisibility(opt.value)}>
                      <span>{opt.label}</span>
                      <span className="vis-desc">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="group-edit-actions">
                  <button className="btn-primary" onClick={saveGroupSettings}>Save changes</button>
                  <button className="btn-ghost" onClick={() => setEditingGroup(false)}>Cancel</button>
                  <button className="btn-danger" onClick={deleteGroup}>Delete list</button>
                </div>
              </div>
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
                  <button className="icon-btn" onClick={() => setEditingGroup(true)} title="Edit list settings">⚙</button>
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
              <form onSubmit={addTodo} className="add-todo-form">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Add a task…" />
                <button type="submit">Add</button>
              </form>
            )}

            <ul className="todo-list">
              {todos.map((todo, index) => {
                const st = statusForTodo(todo)
                const due = formatDueDate(todo.due_date)
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
                      <input
                        type="checkbox"
                        checked={todo.is_complete}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleTodo(todo)}
                      />
                    )}

                    <div className="todo-main">
                      <span className="todo-title">{todo.title}</span>
                      {todo.description && <span className="todo-sub">{todo.description}</span>}
                      {due && (
                        <span className={`todo-due ${due.overdue ? 'overdue' : due.soon ? 'due-soon' : ''}`}>
                          📅 {due.label}
                        </span>
                      )}
                    </div>

                    {/* Status pill */}
                    <span
                      className="todo-status-pill"
                      style={{ color: st.color, background: st.bg }}
                      onClick={e => e.stopPropagation()}
                    >
                      {st.label}
                    </span>

                    {nudgeCount(todo.id) > 0 && (
                      <span className="nudge-badge">👋 {nudgeCount(todo.id)}</span>
                    )}

                    {readOnly && (
                      <button
                        className={`nudge-btn ${nudgedIds.has(todo.id) ? 'nudged' : ''}`}
                        disabled={nudgedIds.has(todo.id)}
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (nudgedIds.has(todo.id)) return
                          await supabase.from('nudges').insert({ todo_id: todo.id, from_user_id: userId })
                          await supabase.from('notifications').insert({
                            user_id: group.owner_id,
                            from_user_id: userId,
                            type: 'nudge',
                            entity_id: todo.id,
                          })
                          setNudgedIds(prev => new Set([...prev, todo.id]))
                        }}
                      >
                        {nudgedIds.has(todo.id) ? 'Nudged 👋' : 'Nudge 👋'}
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

      {/* ── Task Detail Panel ── */}
      {selectedTodo && !editingGroup && (
        <TaskDetailPanel
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

// ── Task Detail Panel (right drawer) ────────────────────────────────────────
function TaskDetailPanel({ todo, readOnly, allGroups, onClose, onUpdate, onDelete, onMove, onToggle }) {
  const [title, setTitle] = useState(todo.title)
  const [description, setDescription] = useState(todo.description || '')
  const [notes, setNotes] = useState(todo.notes || '')
  const [dueDate, setDueDate] = useState(todo.due_date ? todo.due_date.slice(0, 16) : '')
  const [status, setStatus] = useState(todo.status || 'not_started')
  const [saving, setSaving] = useState(false)
  const [moveTarget, setMoveTarget] = useState('')

  // Sync if parent todo changes (realtime)
  useEffect(() => {
    setTitle(todo.title)
    setDescription(todo.description || '')
    setNotes(todo.notes || '')
    setDueDate(todo.due_date ? todo.due_date.slice(0, 16) : '')
    setStatus(todo.status || 'not_started')
  }, [todo.id])

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

  return (
    <div className="task-detail-panel">
      <div className="task-detail-header">
        <div className="task-detail-header-left">
          {!readOnly && (
            <input
              type="checkbox"
              checked={todo.is_complete}
              onChange={() => onToggle(todo)}
              className="task-detail-check"
            />
          )}
          <span className="task-detail-title-label">Task Details</span>
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="task-detail-body">
        {/* Title */}
        <div className="task-detail-field">
          <label className="task-detail-label">Title</label>
          {readOnly
            ? <p className="task-detail-value">{title}</p>
            : <input value={title} onChange={e => setTitle(e.target.value)} className="task-detail-input" />
          }
        </div>

        {/* Description */}
        <div className="task-detail-field">
          <label className="task-detail-label">Description</label>
          {readOnly
            ? <p className="task-detail-value">{description || <em>None</em>}</p>
            : <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="task-detail-input" rows={3} placeholder="Add a description…" />
          }
        </div>

        {/* Notes */}
        <div className="task-detail-field">
          <label className="task-detail-label">Notes</label>
          {readOnly
            ? <p className="task-detail-value">{notes || <em>None</em>}</p>
            : <textarea value={notes} onChange={e => setNotes(e.target.value)}
                className="task-detail-input" rows={2} placeholder="Add notes…" />
          }
        </div>

        {/* Due Date */}
        <div className="task-detail-field">
          <label className="task-detail-label">Due Date</label>
          {readOnly
            ? <p className="task-detail-value">{dueDate ? new Date(dueDate).toLocaleString() : 'None'}</p>
            : (
              <div className="task-detail-due-row">
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="task-detail-input"
                />
                {dueDate && (
                  <button className="task-detail-clear-btn" onClick={() => setDueDate('')} title="Clear">✕</button>
                )}
              </div>
            )
          }
        </div>

        {/* Status */}
        <div className="task-detail-field">
          <label className="task-detail-label">Status</label>
          <div className="task-detail-status-row">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                disabled={readOnly || todo.is_complete}
                className={`task-status-btn ${status === opt.value || (todo.is_complete && opt.value === 'done') ? 'active' : ''}`}
                style={{
                  '--st-color': opt.color,
                  '--st-bg': opt.bg,
                }}
                onClick={() => !readOnly && !todo.is_complete && handleStatusChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Move to list */}
        {!readOnly && allGroups.length > 0 && (
          <div className="task-detail-field">
            <label className="task-detail-label">Move to list</label>
            <div className="task-detail-move-row">
              <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} className="task-detail-input">
                <option value="">Select a list…</option>
                {allGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.icon || '📋'} {g.name}</option>
                ))}
              </select>
              <button
                className="btn-primary-sm"
                disabled={!moveTarget}
                onClick={() => moveTarget && onMove(todo.id, moveTarget)}
              >
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
          <button className="btn-danger" onClick={() => onDelete(todo.id)}>Delete task</button>
        </div>
      )}
    </div>
  )
}