import { useNotifications } from '../context/NotificationContext'
import { useFadeIn } from '../hooks/useFadeIn'

const TYPE_CONFIG = {
  nudge:                 { icon: '👋', label: 'nudged you about a task' },
  friend_request:        { icon: '🤝', label: 'sent you a friend request' },
  friend_accepted:       { icon: '✓',  label: 'accepted your friend request' },
  friend_removed:        { icon: '👤', label: 'removed you as a friend' },
  list_shared:           { icon: '📋', label: 'shared a list with you' },
  nudged_task_completed: { icon: '✅', label: 'completed a task you nudged' },
  friend_list_created:   { icon: '📝', label: 'created a new list' },
  due_date:              { icon: '⏰', label: 'task is due' },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationsPanel() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const visible = useFadeIn([])

  return (
    <div className={`page ${visible ? 'fade-in' : ''}`}>
      <div className="page-header">
        <h2>
          Notifications
          {unreadCount > 0 && (
            <span className="notif-panel-badge">{unreadCount}</span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button className="btn-ghost-sm" onClick={markAllRead}>Mark all read</button>
        )}
      </div>

      <ul className="notif-list">
        {notifications.map((n, i) => {
          const cfg = TYPE_CONFIG[n.type] || { icon: '●', label: n.type }
          const name = n.from_user?.display_name || n.from_user?.username || 'Someone'
          return (
            <li
              key={n.id}
              className={`notif-item ${!n.read ? 'unread' : ''}`}
              style={{ '--i': i }}
              onClick={() => !n.read && markRead(n.id)}
            >
              <div className="notif-avatar">
                {n.from_user?.avatar_url
                  ? <img src={n.from_user.avatar_url} alt="" />
                  : <span>{name[0].toUpperCase()}</span>
                }
              </div>
              <div className="notif-body">
                <p className={`notif-text ${!n.read ? 'notif-text-bold' : ''}`}>
                  <strong>{name}</strong> {cfg.label}
                </p>
                <span className="notif-time">{timeAgo(n.created_at)}</span>
              </div>
              <span className="notif-icon">{cfg.icon}</span>
              {!n.read && <span className="notif-dot" />}
            </li>
          )
        })}
        {notifications.length === 0 && (
          <p className="empty-state">No notifications yet.</p>
        )}
      </ul>
    </div>
  )
}