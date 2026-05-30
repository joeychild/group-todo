import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: '🔒 Private', desc: 'Only you' },
  { value: 'friends', label: '👥 Friends', desc: 'All your friends' },
  { value: 'groups', label: '🫂 Groups', desc: 'Selected friend groups' },
  { value: 'public', label: '🌐 Public', desc: 'Anyone' },
]

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
  const dragItem = useRef(null)
  const visible = useFadeIn([group.id])

  useEffect(() => {
    setGroupName(group.name)
    setGroupIcon(group.icon || '📋')
    setGroupVisibility(group.visibility)
    setCoverPreview(group.cover_url)

    const fetchData = async () => {
      setLoading(true)
      const { data: todosData } = await supabase
        .from('todos')
        .select('*')
        .eq('group_id', group.id)
        .order('position', { ascending: true })

      const ids = todosData?.map(t => t.id) ?? []
      const { data: nudgesData } = ids.length
        ? await supabase.from('nudges').select('todo_id').in('todo_id', ids)
        : { data: [] }

      setTodos(todosData ?? [])
      setNudges(nudgesData ?? [])
      setLoading(false)
    }

    fetchData()

    // Realtime: todos in this group
    const todoSub = supabase
      .channel('todos-' + group.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `group_id=eq.${group.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTodos(prev => [...prev, payload.new].sort((a, b) => a.position - b.position))
          } else if (payload.eventType === 'UPDATE') {
            setTodos(prev => prev.map(t => t.id === payload.new.id ? payload.new : t).sort((a, b) => a.position - b.position))
          } else if (payload.eventType === 'DELETE') {
            setTodos(prev => prev.filter(t => t.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    // Realtime: nudges on these todos
    const nudgeSub = supabase
      .channel('nudges-' + group.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nudges' },
        (payload) => setNudges(prev => [...prev, payload.new])
      )
      .subscribe()

    return () => {
      supabase.removeChannel(todoSub)
      supabase.removeChannel(nudgeSub)
    }
  }, [group.id])

  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const maxPos = todos.reduce((m, t) => Math.max(m, t.position), -1)
    await supabase.from('todos').insert({
      user_id: userId,
      group_id: group.id,
      title: newTitle.trim(),
      position: maxPos + 1
    })
    setNewTitle('')
  }

  const toggleTodo = async (todo) => {
    await supabase.from('todos').update({ is_complete: !todo.is_complete }).eq('id', todo.id)
  }

  const deleteTodo = async (id) => {
    await supabase.from('todos').delete().eq('id', id)
  }

  // Drag reorder
  const handleDragStart = (e, index) => {
    dragItem.current = index
    e.dataTransfer.effectAllowed = 'move'
  }

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
    await Promise.all(updated.map(t =>
      supabase.from('todos').update({ position: t.position }).eq('id', t.id)
    ))
  }

  // Cover image upload
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

    const { data } = await supabase
      .from('list_groups')
      .update({ name: groupName, icon: groupIcon, visibility: groupVisibility, cover_url })
      .eq('id', group.id)
      .select()
      .single()

    if (data) onGroupUpdate(data)
    setEditingGroup(false)
  }

  const deleteGroup = async () => {
    if (!confirm(`Delete "${group.name}" and all its tasks? This cannot be undone.`)) return
    await supabase.from('list_groups').delete().eq('id', group.id)
    onGroupUpdate(null) // signal deletion
  }

  const nudgeCount = (todoId) => nudges.filter(n => n.todo_id === todoId).length

  if (loading) return <div className="page-loading">Loading…</div>

  return (
    <div className={`todo-page ${visible ? 'fade-in' : ''}`}>
      {/* Group header */}
      <div className="todo-header">
        {coverPreview && !editingGroup && (
          <div className="todo-cover" style={{ backgroundImage: `url(${coverPreview})` }} />
        )}
        <div className="todo-header-content">
          {editingGroup ? (
            <div className="group-edit-form">
              {/* Cover upload */}
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
                  <button
                    key={opt.value}
                    className={`visibility-opt ${groupVisibility === opt.value ? 'active' : ''}`}
                    onClick={() => setGroupVisibility(opt.value)}
                  >
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
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Add a task…"
              />
              <button type="submit">Add</button>
            </form>
          )}

          <ul className="todo-list">
            {todos.map((todo, index) => (
              <li
                key={todo.id}
                className={`todo-item ${todo.is_complete ? 'complete' : ''} ${!readOnly && dragOver === index ? 'drag-over' : ''}`}
                draggable={!readOnly}
                onDragStart={!readOnly ? e => handleDragStart(e, index) : undefined}
                onDragOver={!readOnly ? e => { e.preventDefault(); setDragOver(index) } : undefined}
                onDrop={!readOnly ? e => handleDrop(e, index) : undefined}
                onDragLeave={!readOnly ? () => setDragOver(null) : undefined}
                style={{ '--i': index }}
              >
                {!readOnly && <span className="drag-handle">⠿</span>}
                {!readOnly && (
                  <input type="checkbox" checked={todo.is_complete} onChange={() => toggleTodo(todo)} />
                )}
                <span className="todo-title">{todo.title}</span>
                {nudgeCount(todo.id) > 0 && (
                  <span className="nudge-badge">👋 {nudgeCount(todo.id)}</span>
                )}
                {readOnly ? (
                  <button
                    className={`nudge-btn ${nudgedIds.has(todo.id) ? 'nudged' : ''}`}
                    disabled={nudgedIds.has(todo.id)}
                    onClick={async () => {
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
                ) : (
                  <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>✕</button>
                )}
              </li>
            ))}
            {todos.length === 0 && (
              <li className="todo-empty">
                {readOnly ? 'All caught up 🎉' : 'No tasks yet — add one above.'}
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
