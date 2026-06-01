import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function defaultGradient(seed = '') {
  const h1 = (((seed.charCodeAt(0) || 0) * 37) + ((seed.charCodeAt(1) || 0) * 13)) % 360
  const h2 = (h1 + 60) % 360
  return `linear-gradient(135deg, hsl(${h1},55%,72%), hsl(${h2},60%,62%))`
}

/**
 * ProfileModal
 * Props:
 *   profile        — the profile object to display { id, username, display_name, avatar_url, bio, banner_url }
 *   currentUserId  — the logged-in user's ID
 *   isSelf         — true if viewing your own profile
 *   onClose        — called to close modal
 *   onGoSettings   — called when gear icon is clicked (only for self)
 *   friendStatus   — 'none' | 'friends' | 'pending_sent' | 'pending_received'
 *   onSendRequest  — () => void
 *   onRemoveFriend — () => void
 */
export default function ProfileModal({
  profile,
  currentUserId,
  isSelf,
  onClose,
  onGoSettings,
  friendStatus = 'none',
  onSendRequest,
  onRemoveFriend,
}) {
  if (!profile) return null

  const bannerStyle = profile.banner_url
    ? { backgroundImage: `url(${profile.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: defaultGradient(profile.id || profile.username || '') }

  return createPortal(
    <div className="modal-backdrop profile-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="profile-modal-card">
        {/* Banner */}
        <div className="profile-modal-banner" style={bannerStyle}>
          <button className="profile-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Avatar (overlapping banner) */}
        <div className="profile-modal-avatar-wrap">
          <div className="profile-modal-avatar">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" />
              : <span>{(profile.display_name || profile.username || '?')[0].toUpperCase()}</span>
            }
          </div>
          {isSelf && (
            <button className="profile-modal-gear" onClick={onGoSettings} title="Settings">⚙</button>
          )}
        </div>

        {/* Info */}
        <div className="profile-modal-body">
          <div className="profile-modal-names">
            <span className="profile-modal-display">{profile.display_name || profile.username}</span>
            <span className="profile-modal-username">@{profile.username}</span>
          </div>

          {profile.bio && (
            <p className="profile-modal-bio">{profile.bio}</p>
          )}

          {!isSelf && (
            <div className="profile-modal-actions">
              {friendStatus === 'friends' ? (
                <button className="btn-ghost-sm" style={{ color: 'var(--danger)' }} onClick={onRemoveFriend}>
                  Remove friend
                </button>
              ) : friendStatus === 'pending_sent' ? (
                <span className="badge-pending">Request sent</span>
              ) : friendStatus === 'pending_received' ? (
                <span className="badge-pending">They sent you a request</span>
              ) : (
                <button className="btn-primary-sm" onClick={onSendRequest}>Add friend</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}