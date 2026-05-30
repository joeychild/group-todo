import { createContext, useContext, useRef, useState, useEffect } from 'react'

const AudioCtx = createContext(null)

const DEFAULT_SETTINGS = {
  nudgeSound: 'default',       // 'default' | 'custom' | 'off'
  notificationSound: 'default',
  nudgeVolume: 0.7,
  notificationVolume: 0.7,
  customNudgeUrl: null,
  customNotificationUrl: null,
}

// Built-in synthesized sounds using Web Audio API (no files needed)
function createNudgeSound(ctx) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(520, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.1)
  osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.2)
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.4)
}

function createNotificationSound(ctx) {
  // Two-tone chime
  const times = [0, 0.15]
  const freqs = [660, 880]
  times.forEach((t, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freqs[i], ctx.currentTime + t)
    gain.gain.setValueAtTime(0, ctx.currentTime + t)
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.5)
    osc.start(ctx.currentTime + t)
    osc.stop(ctx.currentTime + t + 0.5)
  })
}

export function AudioProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('audioSettings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch { return DEFAULT_SETTINGS }
  })

  const audioCtxRef = useRef(null)
  const customNudgeRef = useRef(null)
  const customNotifRef = useRef(null)

  // Persist settings
  useEffect(() => {
    localStorage.setItem('audioSettings', JSON.stringify(settings))
  }, [settings])

  // Load custom audio files when URLs change
  useEffect(() => {
    if (settings.customNudgeUrl) {
      const audio = new Audio(settings.customNudgeUrl)
      audio.volume = settings.nudgeVolume
      customNudgeRef.current = audio
    }
  }, [settings.customNudgeUrl, settings.nudgeVolume])

  useEffect(() => {
    if (settings.customNotificationUrl) {
      const audio = new Audio(settings.customNotificationUrl)
      audio.volume = settings.notificationVolume
      customNotifRef.current = audio
    }
  }, [settings.customNotificationUrl, settings.notificationVolume])

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  const playNudge = () => {
    if (settings.nudgeSound === 'off') return
    if (settings.nudgeSound === 'custom' && customNudgeRef.current) {
      customNudgeRef.current.currentTime = 0
      customNudgeRef.current.volume = settings.nudgeVolume
      customNudgeRef.current.play().catch(() => {})
      return
    }
    try {
      const ctx = getAudioContext()
      createNudgeSound(ctx)
    } catch (e) { console.warn('Audio playback failed', e) }
  }

  const playNotification = () => {
    if (settings.notificationSound === 'off') return
    if (settings.notificationSound === 'custom' && customNotifRef.current) {
      customNotifRef.current.currentTime = 0
      customNotifRef.current.volume = settings.notificationVolume
      customNotifRef.current.play().catch(() => {})
      return
    }
    try {
      const ctx = getAudioContext()
      createNotificationSound(ctx)
    } catch (e) { console.warn('Audio playback failed', e) }
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
