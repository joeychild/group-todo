import { useNotifications } from '../context/NotificationContext'

const TYPE_CONFIG = {
  nudge: { icon: '👋', color: 'var(--nudge)' },
  friend_request: { icon: '🤝', color: 'var(--accent)' },
  friend_accepted: { icon: '✓', color: 'var(--accent)' },
  list_shared: { icon: '📋', color: 'var(--accent)' },
}

export default function ToastContainer() {
  const { toasts } = useNotifications()

  return (
    <div className="toast-container">
      {toasts.map((toast, i) => {
        const cfg = TYPE_CONFIG[toast.type] || { icon: '●', color: 'var(--text)' }
        const name = toast.from_user?.display_name || toast.from_user?.username || 'Someone'
        return (
          <div key={toast.toastId} className="toast" style={{ '--toast-i': i }}>
            <span className="toast-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
            <div className="toast-text">
              <strong>{name}</strong>
              {toast.type === 'nudge' && ' nudged you'}
              {toast.type === 'friend_request' && ' sent a friend request'}
              {toast.type === 'friend_accepted' && ' accepted your request'}
              {toast.type === 'list_shared' && ' shared a list with you'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
