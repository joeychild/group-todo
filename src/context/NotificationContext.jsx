import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAudio } from './AudioContext'

const NotifCtx = createContext(null)

export function NotificationProvider({ children, userId }) {
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])
  const { playNotification, playNudge } = useAudio()

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select(`*, from_user:profiles!notifications_from_user_id_fkey(username, display_name, avatar_url)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
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
          // Fetch sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', payload.new.from_user_id)
            .single()

          const notif = { ...payload.new, from_user: sender }
          setNotifications(prev => [notif, ...prev])

          // Play sound based on type
          if (payload.new.type === 'nudge') {
            playNudge()
          } else {
            playNotification()
          }

          // Show toast
          addToast(notif)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [userId, fetchNotifications])

  const addToast = (notif) => {
    const id = notif.id
    setToasts(prev => [...prev, { ...notif, toastId: id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.toastId !== id))
    }, 4000)
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

  return (
    <NotifCtx.Provider value={{ notifications, toasts, unreadCount, markRead, markAllRead, fetchNotifications }}>
      {children}
    </NotifCtx.Provider>
  )
}

export const useNotifications = () => useContext(NotifCtx)
