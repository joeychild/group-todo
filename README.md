# ✦ GroupDo

GroupDo is a collaborative to-do list app built with React and Supabase. Create and manage personal lists, share them with friends, pin your favorites, and nudge each other to stay on track — all in real time.

---

## Features

- **Lists** — Create, rename, reorder, and delete task lists with custom emoji icons and cover images
- **Pin & unpin** — Pin important lists to display them as large cards; unpinned lists show as compact rows
- **Tasks** — Add, complete, delete, and drag-to-reorder tasks within any list
- **Visibility controls** — Set each list to Private, Friends, Groups, or Public
- **Friends** — Send and accept friend requests; organize friends into named groups
- **Friends' Lists** — Browse lists your friends have shared with you
- **Nudges** — Nudge friends about specific tasks with a notification sound
- **Real-time sync** — All changes propagate instantly via Supabase Realtime
- **Notifications** — In-app badge counts for pending friend requests and new lists; toast popups for live events
- **Audio** — Built-in synthesized sounds for nudges and notifications, with custom file upload and per-sound volume controls
- **Settings** — Edit display name, bio, avatar, password, and email; delete account

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (postgres_changes) |
| Storage | Supabase Storage (avatars & covers) |
| Styling | Plain CSS with custom properties |
| Fonts | Lora · DM Sans · IBM Plex Mono |

---

## Project Structure

```
src/
├── components/
│   ├── Auth.jsx               # Login / sign-up / forgot password
│   ├── UsernameSetup.jsx      # First-run profile creation
│   ├── Sidebar.jsx            # Navigation rail with badge counts
│   ├── MyTasksPanel.jsx       # Lists overview: pinned cards + unpinned rows
│   ├── TodoList.jsx           # Individual list with tasks
│   ├── Friends.jsx            # Friends, requests, groups, friends' lists
│   ├── Settings.jsx           # Profile, account, and audio settings
│   ├── NotificationsPanel.jsx # Notification history
│   └── ToastContainer.jsx     # Live toast popups
├── context/
│   ├── AudioContext.jsx       # Global audio playback and settings
│   └── NotificationContext.jsx# Global notification state and realtime
├── hooks/
│   └── useFadeIn.js           # Fade-in animation hook
├── supabaseClient.js          # Supabase client init
├── App.jsx                    # Root shell, routing, badge state
├── App.css                    # All styles
└── main.jsx                   # React entry point
```

## Enjoy!