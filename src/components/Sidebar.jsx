import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'

const VISIBILITY_ICONS = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }

// Deterministic pastel gradient per list id for default avatars
function defaultGradient(id = '') {
  const h1 = (id.charCodeAt(0) * 37 + id.charCodeAt(1) * 13) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
}

export default function Sidebar({
  profile, userId,
  selectedGroup, onSelectGroup,
  currentView, onViewChange,
}) {
  const [friendRequestCount, setFriendRequestCount] = useState(0)
  const [friends, setFriends] = useState([])
  const [friendLists, setFriendLists] = useState({})
  const [expandedFriend, setExpandedFriend] = useState(null)
  const [friendsOpen, setFriendsOpen] = useState(true)

  // Friend request badge
  useEffect(() => {
    if (!userId) return
    const fetchCount = async () => {
      const { count } = await supabase
        .from('friend_requests')
        .select('*', { count: 'exact', head: true })
        .eq('to_user_id', userId)
        .eq('status', 'pending')
      setFriendRequestCount(count ?? 0)
    }
    fetchCount()
    const sub = supabase.channel('sidebar-reqs-' + userId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `to_user_id=eq.${userId}` },
        fetchCount)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [userId])

  // Load friends
  useEffect(() => {
    if (!userId) return
    const fetchFriends = async () => {
      const { data } = await supabase
        .from('friendships')
        .select(`
          id, user_a, user_b,
          profile_a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url),
          profile_b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url)
        `)
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      const list = (data ?? []).map(f => ({
        friendshipId: f.id,
        ...(f.user_a === userId ? f.profile_b : f.profile_a),
      }))
      setFriends(list)
    }
    fetchFriends()
  }, [userId])

  // Load a friend's visible lists when they expand
  const toggleFriend = async (friend) => {
    if (expandedFriend === friend.id) { setExpandedFriend(null); return }
    setExpandedFriend(friend.id)
    if (friendLists[friend.id]) return  // already loaded
    const { data } = await supabase
      .from('list_groups')
      .select('*')
      .eq('owner_id', friend.id)
      .neq('visibility', 'private')
      .order('position', { ascending: true })
    setFriendLists(prev => ({ ...prev, [friend.id]: data ?? [] }))
  }

  const navItems = [
    { id: 'my-todos',  icon: '◈', label: 'My Tasks' },
    { id: 'friends',   icon: '⊹', label: 'Friends', badge: friendRequestCount },
  ]

  const ListAvatar = ({ group, size = 22 }) => {
    if (group.cover_url) return (
      <img src={group.cover_url} alt=""
        style={{ width: size, height: size, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
    )
    return (
      <span style={{
        width: size, height: size, borderRadius: 5, flexShrink: 0,
        background: defaultGradient(group.id),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.52,
      }}>
        {group.icon || '📋'}
      </span>
    )
  }

  return (
    <aside className="sidebar">
      {/* Profile */}
      <div className="sidebar-profile" onClick={() => onViewChange('settings')}>
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
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${currentView === item.id && !selectedGroup ? 'active' : ''}`}
            onClick={() => { onViewChange(item.id); onSelectGroup(null) }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge > 0 && <span className="nav-badge-dot">{item.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ── Friends' Lists section ── */}
      <div className="sidebar-section-header" onClick={() => setFriendsOpen(o => !o)} style={{ cursor: 'pointer' }}>
        <span>Friends' Lists</span>
        <span className="section-chevron">{friendsOpen ? '▾' : '▸'}</span>
      </div>
      {friendsOpen && (
        <div className="sidebar-groups">
          {friends.length === 0
            ? <p className="sidebar-empty">Add friends to see their lists</p>
            : friends.map(friend => (
                <div key={friend.id}>
                  {/* Friend header row */}
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

                  {/* Friend's lists */}
                  {expandedFriend === friend.id && (
                    <div className="sidebar-friend-lists">
                      {!friendLists[friend.id]
                        ? <p className="sidebar-empty">Loading…</p>
                        : friendLists[friend.id].length === 0
                        ? <p className="sidebar-empty">No visible lists</p>
                        : friendLists[friend.id].map(list => (
                            <div
                              key={list.id}
                              className={`sidebar-group-item indented ${selectedGroup?.id === list.id && currentView === 'friend-list' ? 'active' : ''}`}
                              onClick={() => { onSelectGroup({ ...list, _isFriendList: true, _friendProfile: friend }); onViewChange('friend-list') }}
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