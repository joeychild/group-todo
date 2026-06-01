import { createContext, useContext, useRef, useState, useEffect } from 'react'

const AudioCtx = createContext(null)

// Point these at real audio files in your /public folder (or CDN).
// E.g. /sounds/nudge.mp3 and /sounds/notification.mp3
const DEFAULT_NUDGE_URL        = '/sounds/nudge.mp3'
const DEFAULT_NOTIFICATION_URL = '/sounds/notification.mp3'

const DEFAULT_SETTINGS = {
  nudgeSound: 'default',        // 'default' | 'custom' | 'off'
  notificationSound: 'default',
  nudgeVolume: 0.7,
  notificationVolume: 0.7,
  customNudgeUrl: null,
  customNotificationUrl: null,
}

export function AudioProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('audioSettings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch { return DEFAULT_SETTINGS }
  })

  // Persist settings
  useEffect(() => {
    localStorage.setItem('audioSettings', JSON.stringify(settings))
  }, [settings])

  const _play = (url, volume) => {
    if (!url) return
    try {
      const audio = new Audio(url)
      audio.volume = Math.max(0, Math.min(1, volume))
      audio.play().catch(() => {})
    } catch (e) { console.warn('Audio playback failed', e) }
  }

  const playNudge = () => {
    if (settings.nudgeSound === 'off') return
    if (settings.nudgeSound === 'custom' && settings.customNudgeUrl) {
      _play(settings.customNudgeUrl, settings.nudgeVolume)
    } else {
      _play(DEFAULT_NUDGE_URL, settings.nudgeVolume)
    }
  }

  const playNotification = () => {
    if (settings.notificationSound === 'off') return
    if (settings.notificationSound === 'custom' && settings.customNotificationUrl) {
      _play(settings.customNotificationUrl, settings.notificationVolume)
    } else {
      _play(DEFAULT_NOTIFICATION_URL, settings.notificationVolume)
    }
  }

  const updateSettings = (updates) => {
    setSettings(prev => ({ ...prev, ...updates }))
  }

  // Load a custom file from a File object (drag/drop or file picker)
  const loadCustomFile = (type, file) => {
    const url = URL.createObjectURL(file)
    if (type === 'nudge') {
      updateSettings({ customNudgeUrl: url, nudgeSound: 'custom' })
    } else {
      updateSettings({ customNotificationUrl: url, notificationSound: 'custom' })
    }
  }

  return (
    <AudioCtx.Provider value={{ settings, updateSettings, playNudge, playNotification, loadCustomFile }}>
      {children}
    </AudioCtx.Provider>
  )
}

export const useAudio = () => useContext(AudioCtx)