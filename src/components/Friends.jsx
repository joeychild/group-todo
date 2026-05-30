import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useFadeIn } from '../hooks/useFadeIn'

const VISIBILITY_ICONS = { private: '🔒', friends: '👥', groups: '🫂', public: '🌐' }

export default function Friends({ userId, onRequestsChange }) {
  const [tab, setTab] = useState('friends') // 'friends' | 'requests' | 'groups' | 'lists'
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [friendGroups, setFriendGroups] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [loadingLists, setLoadingLists] = useState(false)
  const visible = useFadeIn([tab])

  useEffect(() => {
    fetchAll()

    const sub = supabase
      .channel('friend-requests-' + userId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `to_user_id=eq.${userId}` },
        () => fetchAll()
      )
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [userId])

  const fetchAll = async () => {
    // Accepted friendships
    const { data: fships } = await supabase
      .from('friendships')
      .select(`
        id,
        user_a, user_b,
        profile_a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url),
        profile_b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url)
      `)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)

    const friendList = (fships ?? []).map(f => ({
      friendshipId: f.id,
      ...(f.user_a === userId ? f.profile_b : f.profile_a)
    }))
    setFriends(friendList)

    // Pending requests
    const { data: reqs } = await supabase
      .from('friend_requests')
      .select(`
        id, status,
        from_user:profiles!friend_requests_from_user_id_fkey(id, username, display_name, avatar_url),
        to_user:profiles!friend_requests_to_user_id_fkey(id, username, display_name, avatar_url)
      `)
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .eq('status', 'pending')

    const incoming = (reqs ?? []).filter(r => r.to_user?.id === userId || r.to_user_id === userId)
    const outgoing = (reqs ?? []).filter(r => r.from_user?.id === userId || r.from_user_id === userId)
    setRequests({ incoming, outgoing })
    onRequestsChange?.(incoming.length)

    // Friend groups
    const { data: fgroups } = await supabase
      .from('friend_groups')
      .select(`*, members:friend_group_members(friend_id)`)
      .eq('owner_id', userId)
    setFriendGroups(fgroups ?? [])
  }

  const fetchFriendsLists = async () => {
    if (friends.length === 0) { setFriendsLists([]); return }
    setLoadingLists(true)
    const friendIds = friends.map(f => f.id)

    // Fetch lists visible to us from friends (friends-visibility or public)
    const { data } = await supabase
      .from('list_groups')
      .select(`
        *,
        owner:profiles!list_groups_owner_id_fkey(id, username, display_name, avatar_url)
      `)
      .in('owner_id', friendIds)
      .in('visibility', ['friends', 'public'])
      .order('created_at', { ascending: false })

    setFriendsLists(data ?? [])
    setLoadingLists(false)
  }

  // Load friends' lists when tab is opened
  useEffect(() => {
    if (tab === 'lists') fetchFriendsLists()
  }, [tab, friends])

  const searchUsers = async (q) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .neq('id', userId)
      .ilike('username', `%${q}%`)
      .limit(8)
    setSearchResults(data ?? [])
    setSearching(false)
  }

  const sendRequest = async (toUserId) => {
    await supabase.from('friend_requests').insert({ from_user_id: userId, to_user_id: toUserId })
    await supabase.from('notifications').insert({
      user_id: toUserId, from_user_id: userId, type: 'friend_request'
    })
    fetchAll()
    setSearch('')
    setSearchResults([])
  }

  const acceptRequest = async (request) => {
    await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', request.id)
    await supabase.from('friendships').insert({
      user_a: request.from_user.id,
      user_b: userId
    })
    await supabase.from('notifications').insert({
      user_id: request.from_user.id, from_user_id: userId, type: 'friend_accepted'
    })
    fetchAll()
  }

  const declineRequest = async (id) => {
    await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', id)
    fetchAll()
  }

  const removeFriend = async (friendshipId) => {
    if (!confirm('Remove this friend?')) return
    await supabase.from('friendships').delete().eq('id', friendshipId)
    fetchAll()
  }

  const createFriendGroup = async (e) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    await supabase.from('friend_groups').insert({ owner_id: userId, name: newGroupName.trim() })
    setNewGroupName('')
    fetchAll()
  }

  const toggleFriendInGroup = async (groupId, friendId, isInGroup) => {
    if (isInGroup) {
      await supabase.from('friend_group_members')
        .delete().eq('group_id', groupId).eq('friend_id', friendId)
    } else {
      await supabase.from('friend_group_members').insert({ group_id: groupId, friend_id: friendId })
    }
    fetchAll()
  }

  const Avatar = ({ profile, size = 36 }) => (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" />
        : <span>{(profile?.display_name || profile?.username || '?')[0].toUpperCase()}</span>
      }
    </div>
  )

  const isFriend = (id) => friends.some(f => f.id === id)
  const hasPendingRequest = (id) =>
    requests.outgoing.some(r => r.to_user?.id === id) ||
    requests.incoming.some(r => r.from_user?.id === id)

  const tabs = [
    ['friends', 'Friends'],
    ['requests', `Requests${requests.incoming.length ? ` (${requests.incoming.length})` : ''}`],
    ['groups', 'Groups'],
  ]

  return (
    <div className={`page ${visible ? 'fade-in' : ''}`}>
      <div className="page-header">
        <h2>Friends</h2>
        <div className="tab-row">
          {tabs.map(([id, label]) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar — shown on all tabs except lists */}
      {tab !== 'lists' && (
        <div className="search-bar">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); searchUsers(e.target.value) }}
            placeholder="Search users by username…"
          />
          {searching && <span className="search-spinner">…</span>}
        </div>
      )}

      {searchResults.length > 0 && tab !== 'lists' && (
        <ul className="search-results">
          {searchResults.map(user => (
            <li key={user.id} className="search-result-item">
              <Avatar profile={user} />
              <div className="user-info-col">
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
              <Avatar profile={friend} />
              <div className="user-info-col">
                <span className="display-name">{friend.display_name || friend.username}</span>
                <span className="username-tag">@{friend.username}</span>
              </div>
              <button className="btn-ghost-sm" onClick={() => removeFriend(friend.friendshipId)}>Remove</button>
            </li>
          ))}
          {friends.length === 0 && <p className="empty-state">No friends yet — search above to add some.</p>}
        </ul>
      )}

      {tab === 'requests' && (
        <div className="requests-section">
          {requests.incoming.length > 0 && (
            <>
              <h3 className="section-label">Incoming</h3>
              <ul className="user-list">
                {requests.incoming.map(req => (
                  <li key={req.id} className="user-item">
                    <Avatar profile={req.from_user} />
                    <div className="user-info-col">
                      <span className="display-name">{req.from_user?.display_name || req.from_user?.username}</span>
                      <span className="username-tag">@{req.from_user?.username}</span>
                    </div>
                    <button className="btn-primary-sm" onClick={() => acceptRequest(req)}>Accept</button>
                    <button className="btn-ghost-sm" onClick={() => declineRequest(req.id)}>Decline</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {requests.outgoing.length > 0 && (
            <>
              <h3 className="section-label">Sent</h3>
              <ul className="user-list">
                {requests.outgoing.map(req => (
                  <li key={req.id} className="user-item">
                    <Avatar profile={req.to_user} />
                    <div className="user-info-col">
                      <span className="display-name">{req.to_user?.display_name || req.to_user?.username}</span>
                      <span className="username-tag">@{req.to_user?.username}</span>
                    </div>
                    <span className="badge-pending">Pending</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {requests.incoming.length === 0 && requests.outgoing.length === 0 && (
            <p className="empty-state">No pending friend requests.</p>
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="friend-groups-section">
          <form onSubmit={createFriendGroup} className="inline-form">
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="New group name (e.g. Work, Close friends)"
            />
            <button type="submit" className="btn-primary-sm">Create</button>
          </form>

          {friendGroups.map(group => (
            <div key={group.id} className="friend-group-card">
              <div className="friend-group-header">
                <span className="friend-group-name">{group.name}</span>
                <span className="member-count">{group.members?.length ?? 0} members</span>
              </div>
              <ul className="group-member-list">
                {friends.map(friend => {
                  const inGroup = group.members?.some(m => m.friend_id === friend.id)
                  return (
                    <li key={friend.id} className="group-member-item">
                      <Avatar profile={friend} size={28} />
                      <span>{friend.display_name || friend.username}</span>
                      <button
                        className={inGroup ? 'btn-ghost-sm active' : 'btn-ghost-sm'}
                        onClick={() => toggleFriendInGroup(group.id, friend.id, inGroup)}
                      >
                        {inGroup ? '✓ In group' : 'Add'}
                      </button>
                    </li>
                  )
                })}
                {friends.length === 0 && <p className="empty-state small">Add friends first.</p>}
              </ul>
            </div>
          ))}
          {friendGroups.length === 0 && <p className="empty-state">No friend groups yet.</p>}
        </div>
      )}
    </div>
  )
}
