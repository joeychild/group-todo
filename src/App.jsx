import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { AudioProvider } from './context/AudioContext'
import { NotificationProvider } from './context/NotificationContext'
import Auth from './components/Auth'
import UsernameSetup from './components/UsernameSetup'
import Sidebar from './components/Sidebar'
import TodoList from './components/TodoList'
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
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(data)
      setLoading(false)
    }
    fetchProfile()
  }, [session])

  useEffect(() => {
    if (!profile) return
    const fetchGroups = async () => {
      const { data } = await supabase
        .from('list_groups')
        .select('*')
        .eq('owner_id', profile.id)
        .order('position', { ascending: true })
      setListGroups(data ?? [])
    }
    fetchGroups()

    // Realtime for list_groups
    const sub = supabase
      .channel('list-groups-' + profile.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'list_groups', filter: `owner_id=eq.${profile.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setListGroups(prev => [...prev, payload.new].sort((a, b) => a.position - b.position))
          } else if (payload.eventType === 'UPDATE') {
            setListGroups(prev => prev.map(g => g.id === payload.new.id ? payload.new : g))
          } else if (payload.eventType === 'DELETE') {
            setListGroups(prev => prev.filter(g => g.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [profile])

  const handleGroupUpdate = (updated) => {
    if (!updated) {
      // Deleted
      setListGroups(prev => prev.filter(g => g.id !== selectedGroup?.id))
      setSelectedGroup(null)
      setCurrentView('my-todos')
    } else {
      setListGroups(prev => prev.map(g => g.id === updated.id ? updated : g))
      setSelectedGroup(updated)
    }
  }

  if (loading) return <div className="loading">Loading…</div>
  if (!profile) return <UsernameSetup userId={session.user.id} onComplete={setProfile} />

  return (
    <NotificationProvider userId={profile.id}>
      <div className="app-layout">
        <Sidebar
          profile={profile}
          listGroups={listGroups}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          onGroupsChange={setListGroups}
          currentView={currentView}
          onViewChange={setCurrentView}
        />
        <main className="main-content">
          {currentView === 'list' && selectedGroup && (
            <TodoList
              key={selectedGroup.id}
              group={selectedGroup}
              userId={profile.id}
              onGroupUpdate={handleGroupUpdate}
            />
          )}
          {currentView === 'my-todos' && (
            <div className="page fade-in">
              <div className="page-header">
                <h2>My Tasks</h2>
                <p className="page-subtitle">Select a list from the sidebar, or create one with +</p>
              </div>
              {listGroups.length === 0 && (
                <div className="empty-state-card">
                  <div className="empty-icon">✦</div>
                  <h3>No lists yet</h3>
                  <p>Create your first list using the + button in the sidebar.</p>
                </div>
              )}
            </div>
          )}
          {currentView === 'friends' && <Friends userId={profile.id} />}
          {currentView === 'notifications' && <NotificationsPanel />}
          {currentView === 'settings' && (
            <Settings profile={profile} onProfileUpdate={setProfile} />
          )}
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
      {session
        ? <AppShell session={session} />
        : <Auth />
      }
    </AudioProvider>
  )
}
