import { createContext, useContext, useRef, useState, useEffect } from 'react'

const AudioCtx = createContext(null)

const DEFAULT_STARTUP_URL    = '/sounds/startup.mp3'
const DEFAULT_NUDGE_URL      = '/sounds/nudge.mp3'
const DEFAULT_NOTIFICATION_URL = '/sounds/notification.mp3'
const DEFAULT_REMOVE_NUDGE_URL = '/sounds/remove-nudge.mp3'

const DEFAULT_SETTINGS = {
  nudgeSound:           'default',
  notificationSound:    'default',
  startupSound:         'default',
  removeNudgeSound:     'default',
  nudgeVolume:          0.7,
  notificationVolume:   0.7,
  startupVolume:        0.7,
  removeNudgeVolume:    0.7,
  customNudgeUrl:       null,
  customNotificationUrl: null,
  customStartupUrl:     null,
  customRemoveNudgeUrl: null,
  customNudgeName:      null,
  customNotificationName: null,
  customStartupName:    null,
  customRemoveNudgeName: null,
}

export function AudioProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('audioSettings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch { return DEFAULT_SETTINGS }
  })

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
    if (settings.nudgeSound === 'custom' && settings.customNudgeUrl)
      _play(settings.customNudgeUrl, settings.nudgeVolume)
    else _play(DEFAULT_NUDGE_URL, settings.nudgeVolume)
  }

  const playNotification = () => {
    if (settings.notificationSound === 'off') return
    if (settings.notificationSound === 'custom' && settings.customNotificationUrl)
      _play(settings.customNotificationUrl, settings.notificationVolume)
    else _play(DEFAULT_NOTIFICATION_URL, settings.notificationVolume)
  }

  const playStartup = () => {
    if (settings.startupSound === 'off') return
    if (settings.startupSound === 'custom' && settings.customStartupUrl)
      _play(settings.customStartupUrl, settings.startupVolume)
    else _play(DEFAULT_STARTUP_URL, settings.startupVolume)
  }

  const playRemoveNudge = () => {
    if (settings.removeNudgeSound === 'off') return
    if (settings.removeNudgeSound === 'custom' && settings.customRemoveNudgeUrl)
      _play(settings.customRemoveNudgeUrl, settings.removeNudgeVolume)
    else _play(DEFAULT_REMOVE_NUDGE_URL, settings.removeNudgeVolume)
  }

  const updateSettings = (updates) => setSettings(prev => ({ ...prev, ...updates }))

  // Load custom audio file — validate 10s limit, store name
  const loadCustomFile = (type, file) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.onloadedmetadata = () => {
      if (audio.duration > 11) {
        alert('Audio file must be 10 seconds or less.')
        URL.revokeObjectURL(url)
        return
      }
      const nameKey   = `custom${type.charAt(0).toUpperCase() + type.slice(1)}Name`
      const urlKey    = `custom${type.charAt(0).toUpperCase() + type.slice(1)}Url`
      const soundKey  = `${type}Sound`
      // Revoke old object URL if it exists
      const old = settings[urlKey]
      if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
      updateSettings({ [urlKey]: url, [soundKey]: 'custom', [nameKey]: file.name })
    }
    audio.onerror = () => {
      alert('Could not read audio file.')
      URL.revokeObjectURL(url)
    }
  }

  return (
    <AudioCtx.Provider value={{
      settings, updateSettings,
      playNudge, playNotification, playStartup, playRemoveNudge,
      loadCustomFile,
    }}>
      {children}
    </AudioCtx.Provider>
  )
}

export const useAudio = () => useContext(AudioCtx)