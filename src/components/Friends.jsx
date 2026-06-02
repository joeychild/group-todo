import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'
import { useNotifications } from '../context/NotificationContext'
import ProfileModal from './ProfileModal'

export default function Friends({ userId }) {
  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [friendGroups, setFriendGroups] = useState([])
  const [removedAlerts, setRemovedAlerts] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [tabNotifs, setTabNotifs] = useState([])
  const visible = useFadeIn([tab])
  const { markRead, notifications } = useNotifications()

  // Profile modal
  const [profileModal, setProfileModal] = useState(null)
  const openProfile = async (targetProfile) => {
    const status = await getFriendStatus(targetProfile.id)
    setProfileModal({ profile: targetProfile, friendStatus: status })
  }
  
  const getFriendStatus = async (targetId) => {
    const { data: sentReq } = await supabase.from('friend_requests')
      .select('id').eq('from_user_id', userId).eq('to_user_id', targetId).eq('status', 'pending').maybeSingle()
    if (sentReq) return 'pending_sent'
    const { data: recvReq } = await supabase.from('friend_requests')
      .select('id').eq('from_user_id', targetId).eq('to_user_id', userId).eq('status', 'pending').maybeSingle()
    if (recvReq) return 'pending_received'
    const { data: fship } = await supabase.from('friendships')
      .select('id').or(`and(user_a.eq.${userId},user_b.eq.${targetId}),and(user_a.eq.${targetId},user_b.eq.${userId})`)
      .maybeSingle()
    if (fship) return 'friends'
    return 'none'
  }

  useEffect(() => {
    const friendNotifs = notifications.filter(n => !n.read && ['friend_request', 'friend_removed', 'friend_accepted'].includes(n.type))
    const msgs = friendNotifs.map(n => {
      const name = n.from_user?.display_name || n.from_user?.username || 'Someone'
      const map = {
        friend_request: `${name} sent you a friend request`,
        friend_accepted: `${name} accepted your friend request`,
        friend_removed: `${name} removed you as a friend`,
      }
      return { id: n.id, message: map[n.type] || n.type, type: n.type }
    })
    setTabNotifs(msgs)
    friendNotifs.forEach(n => markRead(n.id))
  }, [])

  useEffect(() => {
    const groupNotifs = notifications.filter(n => !n.read && n.type === 'friend_list_created')
    if (groupNotifs.length) {
      const msgs = groupNotifs.map(n => {
        const name = n.from_user?.display_name || n.from_user?.username || 'Someone'
        return { id: n.id, message: `${name} created a new list`, type: n.type }
      })
      setTabNotifs(prev => [...prev, ...msgs])
      groupNotifs.forEach(n => markRead(n.id))
    }
  }, [])

  const dismissTabNotif = (id) => setTabNotifs(prev => prev.filter(n => n.id !== id))

  useEffect(() => {
    fetchAll()
    fetchRemovedAlerts()
    const sub = supabase.channel('friend-requests-' + userId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `to_user_id=eq.${userId}` },
        () => fetchAll())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [userId])

  const fetchRemovedAlerts = async () => {
    const { data } = await supabase.from('notifications')
      .select('id, from_user:profiles!notifications_from_user_id_fkey(username, display_name)')
      .eq('user_id', userId).eq('type', 'friend_removed').eq('read', false)
    setRemovedAlerts(data ?? [])
  }

  const dismissAlert = async (notifId) => {
    await supabase.from('notifications').update({ read: true }).eq('id', notifId)
    setRemovedAlerts(prev => prev.filter(a => a.id !== notifId))
  }

  const fetchAll = useCallback(async () => {
    const { data: fships } = await supabase.from('friendships')
      .select(`id, user_a, user_b,
        profile_a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url, bio, banner_url),
        profile_b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url, bio, banner_url)`)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    setFriends((fships ?? []).map(f => ({
      friendshipId: f.id,
      ...(f.user_a === userId ? f.profile_b : f.profile_a)
    })))

    const { data: reqs } = await supabase.from('friend_requests')
      .select(`id, status,
        from_user:profiles!friend_requests_from_user_id_fkey(id, username, display_name, avatar_url),
        to_user:profiles!friend_requests_to_user_id_fkey(id, username, display_name, avatar_url)`)
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .eq('status', 'pending')
    setRequests({
      incoming: (reqs ?? []).filter(r => r.to_user?.id === userId),
      outgoing: (reqs ?? []).filter(r => r.from_user?.id === userId),
    })

    // Fetch unified groups (groups where I am a member)
    const { data: memberRows } = await supabase.from('friend_group_members')
      .select('group_id')
      .eq('friend_id', userId)
    
    const myGroupIds = memberRows?.map(r => r.group_id) || []

    const { data: fgroups } = await supabase.from('friend_groups')
      .select(`
        id, name, owner_id,
        members:friend_group_members(
          friend_id,
          profile:profiles!friend_group_members_friend_id_fkey(id, username, display_name, avatar_url)
        )
      `)
      .in('id', myGroupIds.length ? myGroupIds : ['00000000-0000-0000-0000-000000000000'])
      
    setFriendGroups(fgroups ?? [])
  }, [userId])

  const searchUsers = async (q) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await supabase.from('profiles')
      .select('id, username, display_name, avatar_url, bio, banner_url')
      .neq('id', userId).ilike('username', `%${q}%`).limit(8)
    setSearchResults(data ?? [])
    setSearching(false)
  }

  const sendRequest = async (toUserId) => {
    await supabase.from('friend_requests').insert({ from_user_id: userId, to_user_id: toUserId })
    await supabase.from('notifications').insert({ user_id: toUserId, from_user_id: userId, type: 'friend_request' })
    fetchAll(); setSearch(''); setSearchResults([])
  }

  const acceptRequest = async (request) => {
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', request.id)
    await supabase.from('friendships').insert({ user_a: request.from_user.id, user_b: userId })
    await supabase.from('notifications').insert({ user_id: request.from_user.id, from_user_id: userId, type: 'friend_accepted' })
    fetchAll()
  }

  const declineRequest = async (id) => {
    await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', id)
    fetchAll()
  }

  const removeFriend = async (friend) => {
    if (!confirm(`Remove ${friend.display_name || friend.username} as a friend?`)) return
    const { error } = await supabase.from('friendships').delete().eq('id', friend.friendshipId)
    if (error) { alert('Could not remove friend: ' + error.message); return }
    await supabase.from('friend_requests').delete()
      .or(`and(from_user_id.eq.${userId},to_user_id.eq.${friend.id}),and(from_user_id.eq.${friend.id},to_user_id.eq.${userId})`)
    await supabase.from('notifications').insert({ user_id: friend.id, from_user_id: userId, type: 'friend_removed' })
    fetchAll()
  }

  const createFriendGroup = async (e) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    const { data: group } = await supabase.from('friend_groups').insert({ owner_id: userId, name: newGroupName.trim() }).select().single()
    
    // Automatically add creator to the group
    if (group) {
      await supabase.from('friend_group_members').insert({ group_id: group.id, friend_id: userId })
    }
    
    setNewGroupName(''); fetchAll()
  }

  const leaveGroup = async (groupId) => {
    const group = friendGroups.find(g => g.id === groupId)
    if (!group) return
    if (!confirm('Leave this group?')) return
    
    await supabase.from('friend_group_members').delete().eq('group_id', groupId).eq('friend_id', userId)

    // Delete group if no members remain
    if (group.members && group.members.length <= 1) {
      await supabase.from('friend_groups').delete().eq('id', groupId)
    }

    fetchAll()
  }

  const toggleFriendInGroup = async (groupId, friendId, isInGroup) => {
    if (isInGroup) {
      await supabase.from('friend_group_members').delete().eq('group_id', groupId).eq('friend_id', friendId)
      
      const group = friendGroups.find(g => g.id === groupId)
      if (group && group.members && group.members.length <= 1) {
         await supabase.from('friend_groups').delete().eq('id', groupId)
      }
    } else {
      await supabase.from('friend_group_members').insert({ group_id: groupId, friend_id: friendId })
    }
    fetchAll()
  }

  const Avatar = ({ profile, size = 36, clickable = false }) => (
    <div
      className="avatar"
      style={{
        width: size, height: size, fontSize: size * 0.4,
        cursor: clickable ? 'pointer' : 'default',
        borderRadius: '50%', overflow: 'hidden',
        background: 'var(--accent-bg)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
      }}
      onClick={clickable ? () => openProfile(profile) : undefined}
    >
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span>{(profile?.display_name || profile?.username || '?')[0].toUpperCase()}</span>
      }
    </div>
  )

  const isFriend = (id) => friends.some(f => f.id === id)
  const hasPendingRequest = (id) =>
    requests.outgoing.some(r => r.to_user?.id === id) ||
    requests.incoming.some(r => r.from_user?.id === id)

  const handleModalSendRequest = async () => {
    if (!profileModal) return
    await sendRequest(profileModal.profile.id)
    setProfileModal(prev => prev ? { ...prev, friendStatus: 'pending_sent' } : prev)
  }
  const handleModalRemoveFriend = async () => {
    if (!profileModal) return
    const friend = friends.find(f => f.id === profileModal.profile.id)
    if (friend) await removeFriend(friend)
    setProfileModal(prev => prev ? { ...prev, friendStatus: 'none' } : prev)
  }

  return (
    <div className={`page ${visible ? 'fade-in' : ''}`}>
      <div className="page-header">
        <h2>Friends</h2>
        <div className="tab-row">
          {[
            ['friends', `Friends${friends.length ? ` (${friends.length})` : ''}`],
            ['requests', `Requests${requests.incoming.length ? ` (${requests.incoming.length})` : ''}`],
            ['groups', `Groups${friendGroups.length ? ` (${friendGroups.length})` : ''}`],
          ].map(([id, label]) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tabNotifs.length > 0 && (
        <div className="tab-notifs">
          {tabNotifs.map(n => (
            <div key={n.id} className={`tab-notif tab-notif-${n.type}`}>
              <span>{n.message}</span>
              <button className="tab-notif-dismiss" onClick={() => dismissTabNotif(n.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {removedAlerts.length > 0 && (
        <div className="removed-alerts">
          {removedAlerts.map(alert => (
            <div key={alert.id} className="removed-alert">
              <span>@{alert.from_user?.username || 'someone'} has removed you as a friend.</span>
              <button className="removed-alert-dismiss" onClick={() => dismissAlert(alert.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="search-bar">
        <input value={search}
          onChange={e => { setSearch(e.target.value); searchUsers(e.target.value) }}
          placeholder="Search users by username…" />
        {searching && <span className="search-spinner">…</span>}
      </div>

      {searchResults.length > 0 && (
        <ul className="search-results">
          {searchResults.map(user => (
            <li key={user.id} className="search-result-item">
              <Avatar profile={user} clickable />
              <div className="user-info-col" style={{ cursor: 'pointer' }} onClick={() => openProfile(user)}>
                <span className="display-name">{user.display_name || user.username}</span>
                <span className="username-tag">@{user.username}</span>
              </div>
              {isFriend(user.id)
                ? <span className="badge-friend">Friends</span>
                : hasPendingRequest(user.id)
                ? <span className="badge-pending">Pending</span>
                : <button className="btn-primary-sm" onClick={() => sendRequest(user.id)}>Add friend</button>
              }
            </li>
          ))}
        </ul>
      )}

      {tab === 'friends' && (
        <ul className="user-list">
          {friends.map(friend => (
            <li key={friend.id} className="user-item">
              <Avatar profile={friend} clickable />
              <div className="user-info-col" style={{ cursor: 'pointer' }} onClick={() => openProfile(friend)}>
                <span className="display-name">{friend.display_name || friend.username}</span>
                <span className="username-tag">@{friend.username}</span>
              </div>
            </li>
          ))}
          {friends.length === 0 && <p className="empty-state">No friends yet — search above to add some.</p>}
        </ul>
      )}

      {tab === 'requests' && (
        <div className="requests-section">
          {requests.incoming.length > 0 && (<>
            <h3 className="section-label">Incoming</h3>
            <ul className="user-list">
              {requests.incoming.map(req => (
                <li key={req.id} className="user-item">
                  <Avatar profile={req.from_user} clickable />
                  <div className="user-info-col" style={{ cursor: 'pointer' }} onClick={() => openProfile(req.from_user)}>
                    <span className="display-name">{req.from_user?.display_name || req.from_user?.username}</span>
                    <span className="username-tag">@{req.from_user?.username}</span>
                  </div>
                  <button className="btn-primary-sm" onClick={() => acceptRequest(req)}>Accept</button>
                  <button className="btn-ghost-sm" onClick={() => declineRequest(req.id)}>Decline</button>
                </li>
              ))}
            </ul>
          </>)}
          {requests.outgoing.length > 0 && (<>
            <h3 className="section-label">Sent</h3>
            <ul className="user-list">
              {requests.outgoing.map(req => (
                <li key={req.id} className="user-item">
                  <Avatar profile={req.to_user} clickable />
                  <div className="user-info-col" style={{ cursor: 'pointer' }} onClick={() => openProfile(req.to_user)}>
                    <span className="display-name">{req.to_user?.display_name || req.to_user?.username}</span>
                    <span className="username-tag">@{req.to_user?.username}</span>
                  </div>
                  <span className="badge-pending">Pending</span>
                </li>
              ))}
            </ul>
          </>)}
          {requests.incoming.length === 0 && requests.outgoing.length === 0 && (
            <p className="empty-state">No pending friend requests.</p>
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="friend-groups-section">
          <form onSubmit={createFriendGroup} className="inline-form" style={{ marginBottom: 20 }}>
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              placeholder="New group name (e.g. Work, Close friends)" />
            <button type="submit" className="btn-primary-sm">Create</button>
          </form>

          {friendGroups.map(group => (
            <div key={group.id} className="friend-group-card">
              <div className="friend-group-header">
                <span className="friend-group-name">{group.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="member-count">{group.members?.length ?? 0} members</span>
                  <button className="btn-ghost-sm" onClick={() => leaveGroup(group.id)}>Leave group</button>
                </div>
              </div>
              
              {/* Member list — shows who is in the group */}
              {group.members && group.members.length > 0 && (
                <div className="fg-member-chips">
                  {group.members.map(m => (
                    <div key={m.friend_id} className={`fg-member-chip ${m.friend_id === userId ? 'fg-member-self' : ''}`}>
                      <div className="fg-chip-avatar">
                        {m.profile?.avatar_url
                          ? <img src={m.profile.avatar_url} alt="" />
                          : <span>{(m.profile?.display_name || m.profile?.username || '?')[0].toUpperCase()}</span>
                        }
                      </div>
                      <span>{m.profile?.display_name || m.profile?.username}{m.friend_id === userId ? ' (you)' : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              <ul className="group-member-list">
                {friends.map(friend => {
                  const inGroup = group.members?.some(m => m.friend_id === friend.id)
                  return (
                    <li key={friend.id} className="group-member-item">
                      <Avatar profile={friend} size={28} clickable />
                      <span style={{ cursor: 'pointer', flex: 1 }} onClick={() => openProfile(friend)}>
                        {friend.display_name || friend.username}
                      </span>
                      <button
                        className={inGroup ? 'btn-ghost-sm active' : 'btn-ghost-sm'}
                        onClick={() => toggleFriendInGroup(group.id, friend.id, inGroup)}
                      >{inGroup ? '✓ In group' : 'Add'}</button>
                    </li>
                  )
                })}
                {friends.length === 0 && <p className="empty-state small">Add friends first.</p>}
              </ul>
            </div>
          ))}
          {friendGroups.length === 0 && <p className="empty-state" style={{ marginBottom: 24 }}>No groups yet.</p>}
        </div>
      )}

      {profileModal && (
        <ProfileModal
          profile={profileModal.profile}
          currentUserId={userId}
          isSelf={false}
          onClose={() => setProfileModal(null)}
          friendStatus={profileModal.friendStatus}
          onSendRequest={handleModalSendRequest}
          onRemoveFriend={handleModalRemoveFriend}
        />
      )}
    </div>
  )
}