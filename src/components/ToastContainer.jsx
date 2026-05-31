import { useNotifications } from '../context/NotificationContext'

const TYPE_CONFIG = {
  nudge:                 { icon: '👋', color: 'var(--nudge)' },
  friend_request:        { icon: '🤝', color: 'var(--accent)' },
  friend_accepted:       { icon: '✓',  color: 'var(--accent)' },
  friend_removed:        { icon: '👤', color: 'var(--danger)' },
  list_shared:           { icon: '📋', color: 'var(--accent)' },
  nudged_task_completed: { icon: '✅', color: 'var(--accent)' },
  friend_list_created:   { icon: '📝', color: 'var(--accent)' },
  due_date:              { icon: '⏰', color: 'var(--nudge)' },
}

const TYPE_LABEL = {
  nudge:                 ' nudged you',
  friend_request:        ' sent a friend request',
  friend_accepted:       ' accepted your request',
  friend_removed:        ' removed you as a friend',
  list_shared:           ' shared a list with you',
  nudged_task_completed: ' completed a task you nudged',
  friend_list_created:   ' created a new list',
  due_date:              ' — task is due',
}

export default function ToastContainer() {
  const { toasts } = useNotifications()

  return (
    <div className="toast-container">
      {toasts.map((toast, i) => {
        if (toast._custom) {
          return (
            <div key={toast.toastId} className="toast toast-custom" style={{ '--toast-i': i }}>
              <span className="toast-icon">⏰</span>
              <div className="toast-text">{toast.message}</div>
            </div>
          )
        }
        const cfg = TYPE_CONFIG[toast.type] || { icon: '●', color: 'var(--text)' }
        const name = toast.from_user?.display_name || toast.from_user?.username || 'Someone'
        return (
          <div key={toast.toastId} className="toast" style={{ '--toast-i': i }}>
            <span className="toast-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
            <div className="toast-text">
              <strong>{name}</strong>
              {TYPE_LABEL[toast.type] || ` ${toast.type}`}
            </div>
          </div>
        )
      })}
    </div>
  )
}