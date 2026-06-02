import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useNotifications } from '../context/NotificationContext'
import ProfileModal from './ProfileModal'

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

// Banner crossfade avatar row — used for both the self profile and friend rows
function BannerFadeRow({ profile, size = 32, children, onClick, className = '' }) {
  const bannerUrl = profile?.banner_url
  const gradientBg = defaultGradient(profile?.id || profile?.username || '')

  return (
    <div className={`banner-fade-row ${className}`} onClick={onClick}>
      {/* Left: banner crossfade strip */}
      <div className="bfr-strip" aria-hidden="true">
        {/* Layer 1: sidebar bg color */}
        <div className="bfr-base" />
        {/* Layer 2: banner/gradient fading in from left */}
        <div
          className="bfr-banner"
          style={bannerUrl
            ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
            : { background: gradientBg }
          }
        />
        {/* Layer 3: fade mask — left=transparent, right=sidebar-bg */}
        <div className="bfr-mask" />
      </div>
      {/* Avatar sits on top */}
      <div className="bfr-avatar" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, fontWeight: 600, color: 'var(--accent)', position: 'relative', zIndex: 1 }}>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>{(profile?.display_name || profile?.username || '?')[0].toUpperCase()}</span>
        }
      </div>
      {children}
    </div>
  )
}

export default function Sidebar({
  profile, userId, myLists, selectedGroup,
  onSelectGroup, currentView, onViewChange,
  listNudgeCounts = {},
  listOverdueCounts = {},
  openedLists = new Set(),
  onOpenList,
  onRefresh,
}) {
  const [friends, setFriends] = useState([])
  const [friendLists, setFriendLists] = useState({})
  const [expandedFriend, setExpandedFriend] = useState(null)
  const [myListsOpen, setMyListsOpen] = useState(true)
  const [friendsListsOpen, setFriendsListsOpen] = useState(true)
  const { friendUnread, taskUnread, unreadCount, fetchNotifications } = useNotifications()

  const [profileModal, setProfileModal] = useState(null)
  const [friendStatus, setFriendStatus] = useState('none')

  const openProfileModal = async (targetProfile, isSelf) => {
    setProfileModal({ profile: targetProfile, isSelf })
    if (!isSelf && targetProfile?.id) {
      const { data: fship } = await supabase.from('friendships')
        .select('id').or(`and(user_a.eq.${userId},user_b.eq.${targetProfile.id}),and(user_a.eq.${targetProfile.id},user_b.eq.${userId})`)
        .maybeSingle()
      if (fship) { setFriendStatus('friends'); return }
      const { data: sentReq } = await supabase.from('friend_requests')
        .select('id').eq('from_user_id', userId).eq('to_user_id', targetProfile.id).eq('status', 'pending').maybeSingle()
      if (sentReq) { setFriendStatus('pending_sent'); return }
      const { data: recvReq } = await supabase.from('friend_requests')
        .select('id').eq('from_user_id', targetProfile.id).eq('to_user_id', userId).eq('status', 'pending').maybeSingle()
      if (recvReq) { setFriendStatus('pending_received'); return }
      setFriendStatus('none')
    }
  }

  const handleSendRequest = async () => {
    if (!profileModal?.profile) return
    await supabase.from('friend_requests').insert({ from_user_id: userId, to_user_id: profileModal.profile.id })
    await supabase.from('notifications').insert({ user_id: profileModal.profile.id, from_user_id: userId, type: 'friend_request' })
    setFriendStatus('pending_sent')
  }

  const handleRemoveFriend = async () => {
    if (!profileModal?.profile) return
    const { data: fship } = await supabase.from('friendships')
      .select('id').or(`and(user_a.eq.${userId},user_b.eq.${profileModal.profile.id}),and(user_a.eq.${profileModal.profile.id},user_b.eq.${userId})`)
      .maybeSingle()
    if (fship) {
      await supabase.from('friendships').delete().eq('id', fship.id)
      await supabase.from('notifications').insert({ user_id: profileModal.profile.id, from_user_id: userId, type: 'friend_removed' })
      setFriendStatus('none')
    }
  }

  const fetchFriends = useCallback(() => {
    if (!userId) return
    supabase.from('friendships').select(`
      id, user_a, user_b,
      profile_a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url, bio, banner_url),
      profile_b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url, bio, banner_url)
    `).or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .then(({ data }) => {
        setFriends((data ?? []).map(f => ({
          friendshipId: f.id,
          ...(f.user_a === userId ? f.profile_b : f.profile_a),
        })))
      })
  }, [userId])

  useEffect(() => {
    fetchFriends()
    const sub = supabase.channel('sidebar-friends-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, fetchFriends)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [userId, fetchFriends])

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

  return (
    <aside className="sidebar">
      {/* Profile row with banner crossfade */}
      <BannerFadeRow
        profile={profile}
        size={32}
        className="sidebar-profile"
        onClick={() => openProfileModal(profile, true)}
      >
        <div className="sidebar-profile-info">
          <span className="sidebar-display-name">{profile.display_name || profile.username}</span>
          <span className="sidebar-username">@{profile.username}</span>
        </div>
        <button
          className="sidebar-refresh-btn"
          title="Refresh"
          onClick={e => { e.stopPropagation(); onRefresh?.(); fetchNotifications?.() }}
        >↺</button>
      </BannerFadeRow>

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
          className={`sidebar-nav-item ${currentView === 'notifications' && !selectedGroup ? 'active' : ''}`}
          onClick={() => { onViewChange('notifications'); onSelectGroup(null) }}
        >
          <span className="nav-icon">◎</span>
          <span className={unreadCount > 0 ? 'sidebar-nav-bold' : ''}>Notifications</span>
          {unreadCount > 0 && <span className="nav-badge-dot">{unreadCount}</span>}
        </button>
      </nav>

      {/* My Lists */}
      <div
        className={`sidebar-section-header clickable ${isMyListsHeaderActive ? 'section-active' : ''}`}
        onClick={() => { onViewChange('my-todos'); onSelectGroup(null); if (!myListsOpen) setMyListsOpen(true) }}
      >
        <span>My Lists</span>
        <button className="chevron-btn" onClick={e => { e.stopPropagation(); setMyListsOpen(o => !o) }}>
          {myListsOpen ? '▾' : '▸'}
        </button>
      </div>

      {myListsOpen && (
        <div className="sidebar-groups">
          {myLists.length === 0
            ? <p className="sidebar-empty">No lists yet</p>
            : myLists.map(group => {
                const nudges = openedLists.has(group.id) ? 0 : (listNudgeCounts[group.id] || 0)
                const overdue = openedLists.has(group.id) ? 0 : (listOverdueCounts[group.id] || 0)
                return (
                  <div
                    key={group.id}
                    className={`sidebar-group-item ${isListActive(group.id) ? 'active' : ''}`}
                    onClick={() => {
                      onSelectGroup(group)
                      onViewChange('list')
                      onOpenList?.(group.id)
                    }}
                  >
                    <ListAvatar group={group} />
                    <span className="group-name">{group.name}</span>
                    {group.pinned && <span style={{ fontSize: 11 }}>📌</span>}
                    {nudges > 0 && (
                      <span className="list-notif-dot nudge-dot" title={`${nudges} nudge${nudges !== 1 ? 's' : ''}`}>
                        {nudges}
                      </span>
                    )}
                    {overdue > 0 && (
                      <span className="list-notif-dot overdue-dot" title={`${overdue} overdue`}>
                        {overdue}
                      </span>
                    )}
                    {nudges === 0 && overdue === 0 && (
                      <span className="group-visibility">{VISIBILITY_ICONS[group.visibility]}</span>
                    )}
                  </div>
                )
              })
          }
        </div>
      )}

      {/* Friends' Lists */}
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
                  {/* Friend row with banner crossfade */}
                  <BannerFadeRow
                    profile={friend}
                    size={22}
                    className={`sidebar-friend-header ${expandedFriend === friend.id ? 'expanded' : ''}`}
                  >
                    <span
                      className="sidebar-friend-name"
                      onClick={() => openProfileModal(friend, false)}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      {friend.display_name || friend.username}
                    </span>
                    <span
                      className="section-chevron"
                      onClick={e => { e.stopPropagation(); toggleFriend(friend) }}
                      style={{ cursor: 'pointer' }}
                    >
                      {expandedFriend === friend.id ? '▾' : '▸'}
                    </span>
                  </BannerFadeRow>

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

      {profileModal && (
        <ProfileModal
          profile={profileModal.profile}
          currentUserId={userId}
          isSelf={profileModal.isSelf}
          onClose={() => setProfileModal(null)}
          onGoSettings={() => { setProfileModal(null); onViewChange('settings'); onSelectGroup(null) }}
          friendStatus={friendStatus}
          onSendRequest={handleSendRequest}
          onRemoveFriend={handleRemoveFriend}
        />
      )}
    </aside>
  )
}