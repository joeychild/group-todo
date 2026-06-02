import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'
import { useNotifications } from '../context/NotificationContext'
import { useAudio } from '../context/AudioContext'
import { EditListModal } from './MyTasksHome'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: '🔒 Private', desc: 'Only you' },
  { value: 'friends', label: '👥 Friends', desc: 'All your friends' },
  { value: 'groups',  label: '🫂 Groups',  desc: 'Selected friend groups' },
  { value: 'public',  label: '🌐 Public',  desc: 'Anyone' },
]

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', color: '#e53e3e' },
  { value: 'in_progress', label: 'In Progress', color: '#d69e2e' },
  { value: 'paused',      label: 'Paused',      color: '#3182ce' },
  { value: 'done',        label: 'Done',        color: '#38a169' },
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

function defaultGradient(seed = '') {
  const h1 = (((seed.charCodeAt(0) || 0) * 37) + ((seed.charCodeAt(1) || 0) * 13)) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
}

// ── Status bubble with dropdown ───────────────────────────────────────────
function StatusBubble({ status, onChange, readOnly, isComplete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const st = STATUS_OPTIONS.find(s => s.value === (isComplete ? 'done' : (status || 'not_started'))) || STATUS_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (readOnly || isComplete) {
    return (
      <span className="todo-status-pill" style={{ color: st.color, borderColor: st.color + '55' }}>
        {st.label}
      </span>
    )
  }

  return (
    <div className="status-bubble-wrap" ref={ref}>
      <span
        className="todo-status-pill"
        style={{ color: st.color, borderColor: st.color + '55', cursor: 'pointer' }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        title="Change status"
      >
        {st.label} ▾
      </span>
      {open && (
        <div className="status-dropdown">
          {STATUS_OPTIONS.filter(s => s.value !== 'done').map(opt => (
            <button
              key={opt.value}
              className={`status-dropdown-opt ${st.value === opt.value ? 'active' : ''}`}
              style={{ '--st-color': opt.color }}
              onClick={e => { e.stopPropagation(); onChange(opt.value); setOpen(false) }}
            >
              <span className="status-dot" style={{ background: opt.color }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Nudge tooltip ────────────────────────────────────────────────────────
function NudgeTooltip({ todoId, count }) {
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
  const [nudgeCounts, setNudgeCounts] = useState({})
  const [nudgedByMe, setNudgedByMe] = useState(new Set())
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newStatus, setNewStatus] = useState('not_started')
  const [loading, setLoading] = useState(true)
  const [editingGroup, setEditingGroup] = useState(false)
  const [coverPreview, setCoverPreview] = useState(group.cover_url)
  const [dragOver, setDragOver] = useState(null)
  const [selectedTodo, setSelectedTodo] = useState(null)
  const [allGroups, setAllGroups] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const dragItem = useRef(null)
  const visible = useFadeIn([group.id])
  const { prefs, addCustomToast, markRead, notifications } = useNotifications()
  const { playNudge } = useAudio()
  const dateRef = useRef()

  // Play list audio on open
  useEffect(() => {
    if (group.audio_url) {
      try {
        const a = new Audio(group.audio_url)
        a.volume = 0.7
        a.play().catch(() => {})
      } catch (e) {}
    }
  }, [group.id])

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
    setCoverPreview(group.cover_url)
    fetchData()

    supabase.from('list_groups').select('id, name, icon').eq('owner_id', userId).neq('id', group.id)
      .then(({ data }) => setAllGroups(data ?? []))
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
      status: newStatus || 'not_started',
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
    // Only send nudge-completed notifications when checking off (not unchecking)
    fetchData()
  }

  const updateTodoField = async (todoId, fields) => {
    await supabase.from('todos').update(fields).eq('id', todoId)
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

  const handleNudge = async (todo, e) => {
    e?.stopPropagation()
    if (nudgedByMe.has(todo.id)) {
      await supabase.from('nudges').delete().eq('todo_id', todo.id).eq('from_user_id', userId)
      setNudgedByMe(prev => { const s = new Set(prev); s.delete(todo.id); return s })
      setNudgeCounts(prev => ({ ...prev, [todo.id]: Math.max((prev[todo.id] || 1) - 1, 0) }))
    } else {
      await supabase.from('nudges').insert({ todo_id: todo.id, from_user_id: userId })
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

  const headerBg = coverPreview
    ? { backgroundImage: `url(${coverPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: defaultGradient(group.id || group.name) }

  return (
    <div className={`todo-page-wrapper ${selectedTodo ? 'with-detail' : ''}`}>
      <div className={`todo-page ${!loading && visible ? 'fade-in' : 'fade-in-hidden'}`}>
        {loading && <div className="page-loading todo-loading-fade">Loading…</div>}
        {!loading && <><div className="todo-header">
          <div className="todo-cover-hero" style={headerBg}>
              <div className="todo-cover-overlay" />
              <div className="todo-cover-content">
                <span className="todo-cover-icon">{group.icon || (group.cover_url ? '' : '📋')}</span>
                <h2 className="todo-cover-title">{group.name}</h2>
                {group.description && <p className="todo-cover-desc">{group.description}</p>}
                <div className="todo-cover-meta">
                  <span className="group-vis-pill light">
                    {VISIBILITY_OPTIONS.find(o => o.value === group.visibility)?.label}
                  </span>
                  {group.audio_url && (
                    <button className="icon-btn light" onClick={
                      () => {if (group.audio_url) {
                        try {
                          const a = new Audio(group.audio_url)
                          a.volume = 0.7
                          a.play().catch(() => {})
                        } catch (e) {}
                      }}
                    } title="Play list audio">♪</button>
                  )
                  }
                  {!readOnly && (
                    <button className="icon-btn light" onClick={() => setEditingGroup(true)} title="Edit list">⚙</button>
                  )}
                  {readOnly && group._friendProfile && (
                    <span className="readonly-badge light">
                      👤 {group._friendProfile.display_name || group._friendProfile.username}'s list
                    </span>
                  )}
                </div>
              </div>
            </div>
        </div>

        {editingGroup && (
          <EditListModal
            group={group}
            userId={userId}
            onSaved={(updated) => { onGroupUpdate(updated); setEditingGroup(false) }}
            onDeleted={() => { onGroupUpdate(null); setEditingGroup(false) }}
            onClose={() => setEditingGroup(false)}
          />
        )}

        <>
            {!readOnly && (
              <div className="add-todo-section">
                {!showAddForm ? (
                  <button className="add-todo-trigger" onClick={() => setShowAddForm(true)}>
                    + Add task
                  </button>
                ) : (
                  <form onSubmit={addTodo} className="add-todo-form-inline">
                    <input
                      className="add-todo-title-input"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="Task name…"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => dateRef.current?.showPicker?.()}
                      title="Set due date"
                    >
                      📅
                    </button>
                    <input
                      ref={dateRef}
                      type="datetime-local"
                      value={newDueDate}
                      onChange={e => setNewDueDate(e.target.value)}
                      className="hidden-date-input"
                    />
                    {newDueDate && (
                      <span className="add-todo-meta-value">
                        {new Date(newDueDate).toLocaleString([], {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: true,
                        })}
                      </span>
                    )}
                    <button type="submit" className="btn-primary-sm" disabled={!newTitle.trim()}>
                      Add
                    </button>
                  </form>
                )}
              </div>
            )}

            <ul className="todo-list">
              {todos.map((todo, index) => {
                const due = formatDueDate(todo.due_date)
                const count = nudgeCounts[todo.id] || 0
                return (
                  <li
                    key={todo.id}
                    className={`todo-item ${todo.is_complete ? 'complete' : ''} ${!readOnly && dragOver === index ? 'drag-over' : ''} ${selectedTodo?.id === todo.id ? 'todo-item-selected' : ''}`}
                    draggable={!readOnly && !todo.is_complete}
                    onDragStart={!readOnly && !todo.is_complete ? e => handleDragStart(e, index) : undefined}
                    onDragOver={!readOnly ? e => { e.preventDefault(); setDragOver(index) } : undefined}
                    onDrop={!readOnly ? e => handleDrop(e, index) : undefined}
                    onDragLeave={!readOnly ? () => setDragOver(null) : undefined}
                    style={{ '--i': index }}
                    onClick={() => setSelectedTodo(selectedTodo?.id === todo.id ? null : todo)}
                  >
                    {!readOnly && !todo.is_complete && (
                      <span className="drag-handle" onClick={e => e.stopPropagation()}>⠿</span>
                    )}
                    {/* Checkbox: owners can always toggle; readOnly visitors cannot */}
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

                    {/* Status pill: show for all incomplete todos; also show on complete so you can see it */}
                    <StatusBubble
                      status={todo.status || 'not_started'}
                      isComplete={todo.is_complete}
                      readOnly={readOnly || todo.is_complete}
                      onChange={async (newSt) => {
                        await updateTodoField(todo.id, { status: newSt })
                      }}
                    />

                    {count > 0 && <NudgeTooltip todoId={todo.id} count={count} />}

                    {/* Nudge button: only on friend's lists, only on incomplete todos */}
                    {readOnly && !todo.is_complete && (
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
        </>}
      </div>

      {selectedTodo && (
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

// ── Task Detail Panel ────────────────────────────────────────────────────────
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

  // Whether the task is editable in the panel
  const canEdit = !readOnly && !todo.is_complete

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
          {canEdit
            ? <input value={title} onChange={e => setTitle(e.target.value)} className="task-detail-input" />
            : <p className="task-detail-value">{title}</p>
          }
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Description</label>
          {canEdit
            ? <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="task-detail-input" rows={3} placeholder="Add a description…" />
            : <p className="task-detail-value">{description || '—'}</p>
          }
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Notes</label>
          {canEdit
            ? <textarea value={notes} onChange={e => setNotes(e.target.value)}
                className="task-detail-input" rows={2} placeholder="Add notes…" />
            : <p className="task-detail-value">{notes || '—'}</p>
          }
        </div>

        <div className="task-detail-field">
          <label className="task-detail-label">Due Date</label>
          {canEdit ? (
            <div className="task-detail-due-row">
              <input type="datetime-local" value={dueDate}
                onChange={e => setDueDate(e.target.value)} className="task-detail-input" />
              {dueDate && (
                <button className="task-detail-clear-btn" onClick={() => setDueDate('')} title="Clear">✕</button>
              )}
            </div>
          ) : (
            <p className={`task-detail-value ${due?.isOverdue ? 'overdue' : ''}`}>
              {dueDate ? new Date(dueDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            </p>
          )}
          {due && canEdit && (
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
                disabled={!canEdit}
                className={`task-status-btn ${(status === opt.value || (todo.is_complete && opt.value === 'done')) ? 'active' : ''}`}
                style={{ '--st-color': opt.color }}
                onClick={() => canEdit && handleStatusChange(opt.value)}>
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

      {canEdit && (
        <div className="task-detail-footer">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn-danger" onClick={() => onDelete(todo.id)}>Delete</button>
        </div>
      )}
      {todo.is_complete && !readOnly && (
        <div className="task-detail-footer">
          <p className="task-complete-note">Uncheck to edit this task.</p>
          <button className="btn-danger" onClick={() => onDelete(todo.id)}>Delete</button>
        </div>
      )}
    </div>
  )
}