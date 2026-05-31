import { useEffect, useState } from 'react'
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
        />
        <main className="main-content">
          {(currentView === 'list' || currentView === 'friend-list') && selectedGroup && (
            <TodoList
              key={selectedGroup.id}
              group={selectedGroup}
              userId={profile.id}
              readOnly={isReadOnly}
              onGroupUpdate={handleGroupUpdate}
            />
          )}
          {currentView === 'my-todos' && (
            <MyTasksHome
              listGroups={listGroups}
              onSelectGroup={(g) => { setSelectedGroup(g); setCurrentView('list') }}
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