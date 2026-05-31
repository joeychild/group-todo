import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNotifications } from '../context/NotificationContext'

function defaultGradient(seed = '') {
  const h1 = (((seed.charCodeAt(0) || 0) * 37) + ((seed.charCodeAt(1) || 0) * 13)) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
}

function ListAvatar({ group, size = 22 }) {
  if (group.cover_url) return (
    <img src={group.cover_url} alt=""
      style={{ width: size, height: size, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
  )
  return (
    <span style={{
      width: size, height: size, borderRadius: 5, flexShrink: 0,
      background: defaultGradient(group.id || group.name),
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.52, userSelect: 'none',
    }}>
      {group.icon || '📋'}
    </span>
  )
}

const VISIBILITY_ICONS = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }

export default function Sidebar({ profile, userId, myLists, selectedGroup, onSelectGroup, currentView, onViewChange }) {
  const [friends, setFriends] = useState([])
  const [friendLists, setFriendLists] = useState({})
  const [expandedFriend, setExpandedFriend] = useState(null)
  const [myListsOpen, setMyListsOpen] = useState(true)
  const [friendsListsOpen, setFriendsListsOpen] = useState(true)
  const { friendUnread, taskUnread, unreadCount } = useNotifications()

  useEffect(() => {
    if (!userId) return
    supabase.from('friendships').select(`
      id, user_a, user_b,
      profile_a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url),
      profile_b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url)
    `).or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .then(({ data }) => {
        setFriends((data ?? []).map(f => ({
          friendshipId: f.id,
          ...(f.user_a === userId ? f.profile_b : f.profile_a),
        })))
      })

    // Realtime: update friends list when friendships change
    const sub = supabase.channel('sidebar-friends-' + userId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          supabase.from('friendships').select(`
            id, user_a, user_b,
            profile_a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url),
            profile_b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url)
          `).or(`user_a.eq.${userId},user_b.eq.${userId}`)
            .then(({ data }) => {
              setFriends((data ?? []).map(f => ({
                friendshipId: f.id,
                ...(f.user_a === userId ? f.profile_b : f.profile_a),
              })))
            })
        }
      )
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [userId])

  const toggleFriend = async (friend) => {
    if (expandedFriend === friend.id) { setExpandedFriend(null); return }
    setExpandedFriend(friend.id)
    if (friendLists[friend.id]) return
    const { data } = await supabase.from('list_groups').select('*')
      .eq('owner_id', friend.id).neq('visibility', 'private')
      .order('position', { ascending: true })
    setFriendLists(prev => ({ ...prev, [friend.id]: data ?? [] }))
  }

  const isMyListsHeaderActive = currentView === 'my-todos' && !selectedGroup
  const isListActive = (id) => selectedGroup?.id === id && currentView === 'list'
  const isFriendListActive = (id) => selectedGroup?.id === id && currentView === 'friend-list'
  const isNotifActive = currentView === 'notifications' && !selectedGroup

  return (
    <aside className="sidebar">
      {/* Profile → settings */}
      <div className="sidebar-profile" onClick={() => { onViewChange('settings'); onSelectGroup(null) }}>
        <div className="sidebar-avatar">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" />
            : <span>{(profile.display_name || profile.username)[0].toUpperCase()}</span>
          }
        </div>
        <div className="sidebar-profile-info">
          <span className="sidebar-display-name">{profile.display_name || profile.username}</span>
          <span className="sidebar-username">@{profile.username}</span>
        </div>
      </div>

      {/* Top nav */}
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${currentView === 'friends' && !selectedGroup ? 'active' : ''}`}
          onClick={() => { onViewChange('friends'); onSelectGroup(null) }}
        >
          <span className="nav-icon">⊹</span>
          <span>Friends</span>
          {friendUnread > 0 && <span className="nav-badge-dot">{friendUnread}</span>}
        </button>

        <button
          className={`sidebar-nav-item ${isNotifActive ? 'active' : ''}`}
          onClick={() => { onViewChange('notifications'); onSelectGroup(null) }}
        >
          <span className="nav-icon">◎</span>
          <span className={unreadCount > 0 ? 'sidebar-nav-bold' : ''}>Notifications</span>
          {unreadCount > 0 && <span className="nav-badge-dot">{unreadCount}</span>}
        </button>
      </nav>

      {/* ── My Lists ── */}
      <div
        className={`sidebar-section-header clickable ${isMyListsHeaderActive ? 'section-active' : ''}`}
        onClick={() => { onViewChange('my-todos'); onSelectGroup(null); if (!myListsOpen) setMyListsOpen(true) }}
      >
        <span>
          My Lists
          {taskUnread > 0 && <span className="nav-badge-dot" style={{ marginLeft: 6 }}>{taskUnread}</span>}
        </span>
        <button className="chevron-btn" onClick={e => { e.stopPropagation(); setMyListsOpen(o => !o) }}>
          {myListsOpen ? '▾' : '▸'}
        </button>
      </div>

      {myListsOpen && (
        <div className="sidebar-groups">
          {myLists.length === 0
            ? <p className="sidebar-empty">No lists yet</p>
            : myLists.map(group => (
                <div
                  key={group.id}
                  className={`sidebar-group-item ${isListActive(group.id) ? 'active' : ''}`}
                  onClick={() => { onSelectGroup(group); onViewChange('list') }}
                >
                  <ListAvatar group={group} />
                  <span className="group-name">{group.name}</span>
                  {group.pinned && <span style={{ fontSize: 11 }}>📌</span>}
                  <span className="group-visibility">{VISIBILITY_ICONS[group.visibility]}</span>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Friends' Lists ── */}
      <div
        className="sidebar-section-header clickable"
        onClick={() => setFriendsListsOpen(o => !o)}
      >
        <span>Friends' Lists</span>
        <span className="section-chevron">{friendsListsOpen ? '▾' : '▸'}</span>
      </div>

      {friendsListsOpen && (
        <div className="sidebar-groups">
          {friends.length === 0
            ? <p className="sidebar-empty">Add friends to see their lists</p>
            : friends.map(friend => (
                <div key={friend.id}>
                  <div
                    className={`sidebar-friend-header ${expandedFriend === friend.id ? 'expanded' : ''}`}
                    onClick={() => toggleFriend(friend)}
                  >
                    <div className="sidebar-friend-avatar">
                      {friend.avatar_url
                        ? <img src={friend.avatar_url} alt="" />
                        : <span>{(friend.display_name || friend.username)[0].toUpperCase()}</span>
                      }
                    </div>
                    <span className="sidebar-friend-name">{friend.display_name || friend.username}</span>
                    <span className="section-chevron">{expandedFriend === friend.id ? '▾' : '▸'}</span>
                  </div>
                  {expandedFriend === friend.id && (
                    <div className="sidebar-friend-lists">
                      {!friendLists[friend.id]
                        ? <p className="sidebar-empty">Loading…</p>
                        : friendLists[friend.id].length === 0
                        ? <p className="sidebar-empty">No visible lists</p>
                        : friendLists[friend.id].map(list => (
                            <div
                              key={list.id}
                              className={`sidebar-group-item indented ${isFriendListActive(list.id) ? 'active' : ''}`}
                              onClick={() => {
                                onSelectGroup({ ...list, _isFriendList: true, _friendProfile: friend })
                                onViewChange('friend-list')
                              }}
                            >
                              <ListAvatar group={list} />
                              <span className="group-name">{list.name}</span>
                              <span className="group-visibility">{VISIBILITY_ICONS[list.visibility]}</span>
                            </div>
                          ))
                      }
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}
    </aside>
  )
}