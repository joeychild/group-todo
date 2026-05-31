import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAudio } from './AudioContext'

const NotifCtx = createContext(null)

const DEFAULT_PREFS = {
  nudge: true,
  friend_request: true,
  friend_removed: true,
  nudged_task_completed: true,
  friend_list_created: true,
  due_date: true,
}

export function NotificationProvider({ children, userId }) {
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('notifPrefs')
      return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS
    } catch { return DEFAULT_PREFS }
  })
  const { playNotification, playNudge } = useAudio()

  const savePrefs = (updated) => {
    setPrefs(updated)
    localStorage.setItem('notifPrefs', JSON.stringify(updated))
  }

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*, from_user:profiles!notifications_from_user_id_fkey(username, display_name, avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)
    setNotifications(data ?? [])
  }, [userId])

  useEffect(() => {
    fetchNotifications()
    if (!userId) return

    const sub = supabase
      .channel('notifications-' + userId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const { data: sender } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', payload.new.from_user_id)
            .single()
          const notif = { ...payload.new, from_user: sender }
          setNotifications(prev => [notif, ...prev])
          if (!prefs[notif.type]) return
          if (notif.type === 'nudge') playNudge()
          else playNotification()
          addToast(notif)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [userId, fetchNotifications, prefs])

  // Due-date polling every minute
  useEffect(() => {
    if (!userId || !prefs.due_date) return
    const check = () => {
      const now = new Date()
      // Toasts handled by TodoList; this context just provides the hook
    }
    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [userId, prefs.due_date])

  const addToast = (notif) => {
    const id = notif.id + '-' + Date.now()
    setToasts(prev => [...prev, { ...notif, toastId: id }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.toastId !== id)), 4500)
  }

  const addCustomToast = (msg) => {
    const id = 'custom-' + Date.now()
    setToasts(prev => [...prev, { toastId: id, _custom: true, message: msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.toastId !== id)), 4500)
  }

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  // Per-source unread counts
  const friendUnread = notifications.filter(n =>
    !n.read && ['friend_request', 'friend_removed', 'friend_accepted'].includes(n.type)
  ).length
  const taskUnread = notifications.filter(n =>
    !n.read && ['nudge', 'nudged_task_completed', 'friend_list_created', 'due_date'].includes(n.type)
  ).length

  return (
    <NotifCtx.Provider value={{
      notifications, toasts, unreadCount, friendUnread, taskUnread,
      markRead, markAllRead, fetchNotifications,
      prefs, savePrefs, addCustomToast, DEFAULT_PREFS,
    }}>
      {children}
    </NotifCtx.Provider>
  )
}

export const useNotifications = () => useContext(NotifCtx)