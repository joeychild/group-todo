import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'
import { AudioProvider } from './context/AudioContext'
import { NotificationProvider } from './context/NotificationContext'
import Auth from './components/Auth'
import UsernameSetup from './components/UsernameSetup'
import Sidebar from './components/Sidebar'
import TodoList from './components/TodoList'
import MyTasksHome from './components/MyTasksHome'
import Friends from './components/Friends'
import NotificationsPanel from './components/NotificationsPanel'
import Settings from './components/Settings'
import ToastContainer from './components/ToastContainer'
import './App.css'

function AppShell({ session }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listGroups, setListGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [currentView, setCurrentView] = useState('my-todos')
  const [refreshKey, setRefreshKey] = useState(0)

  // Per-list notification counts (nudges + overdue)
  const [listNudgeCounts, setListNudgeCounts]   = useState({}) // { groupId: n }
  const [listOverdueCounts, setListOverdueCounts] = useState({}) // { groupId: n }
  // Track which lists the user has opened (clears their badges)
  const [openedLists, setOpenedLists] = useState(new Set())

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data); setLoading(false) })
  }, [session])

  useEffect(() => {
    if (!profile) return
    supabase.from('list_groups').select('*').eq('owner_id', profile.id)
      .order('position', { ascending: true })
      .then(({ data }) => setListGroups(data ?? []))

    const sub = supabase.channel('list-groups-' + profile.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'list_groups', filter: `owner_id=eq.${profile.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT')
            setListGroups(prev => [...prev, payload.new].sort((a, b) => a.position - b.position))
          else if (payload.eventType === 'UPDATE')
            setListGroups(prev => prev.map(g => g.id === payload.new.id ? payload.new : g))
          else if (payload.eventType === 'DELETE')
            setListGroups(prev => prev.filter(g => g.id !== payload.old.id))
        })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [profile])

  // Compute per-list nudge counts and overdue counts
  const refreshListNotifs = useCallback(async (groups) => {
    if (!groups || groups.length === 0) return
    const groupIds = groups.map(g => g.id)

    // Nudge counts: unread nudge notifications for each list
    const { data: nudgeNotifs } = await supabase
      .from('notifications')
      .select('entity_id')
      .eq('user_id', profile?.id)
      .eq('type', 'nudge')
      .eq('read', false)
      .not('entity_id', 'is', null)
    // entity_id is a todo id; map back to group
    if (nudgeNotifs && nudgeNotifs.length) {
      const todoIds = nudgeNotifs.map(n => n.entity_id)
      const { data: todos } = await supabase.from('todos').select('id, group_id').in('id', todoIds)
      const counts = {}
      ;(todos ?? []).forEach(t => {
        if (groupIds.includes(t.group_id)) counts[t.group_id] = (counts[t.group_id] || 0) + 1
      })
      setListNudgeCounts(counts)
    } else {
      setListNudgeCounts({})
    }

    // Overdue counts
    const now = new Date().toISOString()
    const { data: overdueTodos } = await supabase
      .from('todos')
      .select('id, group_id')
      .in('group_id', groupIds)
      .eq('is_complete', false)
      .not('due_date', 'is', null)
      .lt('due_date', now)
    const overdueCounts = {}
    ;(overdueTodos ?? []).forEach(t => {
      overdueCounts[t.group_id] = (overdueCounts[t.group_id] || 0) + 1
    })
    setListOverdueCounts(overdueCounts)
  }, [profile?.id])

  useEffect(() => {
    if (listGroups.length > 0 && profile) refreshListNotifs(listGroups)
  }, [listGroups, profile, refreshKey])

  const handleRefresh = () => setRefreshKey(k => k + 1)

  const handleGroupUpdate = (updated) => {
    if (!updated) {
      setListGroups(prev => prev.filter(g => g.id !== selectedGroup?.id))
      setSelectedGroup(null)
      setCurrentView('my-todos')
    } else {
      setListGroups(prev => prev.map(g => g.id === updated.id ? updated : g))
      setSelectedGroup(updated)
    }
  }

  const handleTogglePin = async (group) => {
    const { data } = await supabase.from('list_groups')
      .update({ pinned: !group.pinned }).eq('id', group.id).select().single()
    if (data) setListGroups(prev => prev.map(g => g.id === data.id ? data : g))
  }

  const handleOpenList = (groupId) => {
    setOpenedLists(prev => new Set([...prev, groupId]))
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!profile) return <UsernameSetup userId={session.user.id} onComplete={setProfile} />

  const isReadOnly = !!selectedGroup?._isFriendList

  return (
    <NotificationProvider userId={profile.id}>
      <div className="app-layout">
        <Sidebar
          profile={profile}
          userId={profile.id}
          myLists={listGroups}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          currentView={currentView}
          onViewChange={(v) => {
            setCurrentView(v)
            if (v !== 'list' && v !== 'friend-list') setSelectedGroup(null)
          }}
          listNudgeCounts={listNudgeCounts}
          listOverdueCounts={listOverdueCounts}
          openedLists={openedLists}
          onOpenList={handleOpenList}
          onRefresh={handleRefresh}
        />
        <main className="main-content">
          {(currentView === 'list' || currentView === 'friend-list') && selectedGroup && (
            <TodoList
              key={selectedGroup.id + '-' + refreshKey}
              group={selectedGroup}
              userId={profile.id}
              readOnly={isReadOnly}
              onGroupUpdate={handleGroupUpdate}
            />
          )}
          {currentView === 'my-todos' && (
            <MyTasksHome
              listGroups={listGroups}
              onSelectGroup={(g) => {
                setSelectedGroup(g)
                setCurrentView('list')
                handleOpenList(g.id)
              }}
              onTogglePin={handleTogglePin}
              onGroupCreated={(g) => {
                setListGroups(prev => [...prev, g].sort((a, b) => a.position - b.position))
                setSelectedGroup(g)
                setCurrentView('list')
              }}
              onGroupUpdated={(updated) => {
                setListGroups(prev => prev.map(g => g.id === updated.id ? updated : g))
              }}
              onGroupDeleted={(id) => {
                setListGroups(prev => prev.filter(g => g.id !== id))
              }}
              userId={profile.id}
            />
          )}
          {currentView === 'friends' && <Friends userId={profile.id} />}
          {currentView === 'notifications' && <NotificationsPanel />}
          {currentView === 'settings' && <Settings profile={profile} onProfileUpdate={setProfile} />}
        </main>
        <ToastContainer />
      </div>
    </NotificationProvider>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="loading">Loading…</div>
  return (
    <AudioProvider>
      {session ? <AppShell session={session} /> : <Auth />}
    </AudioProvider>
  )
}