import { useEffect, useRef, useState } from 'react'

// Returns a className string: 'fade-in' when visible, 'fade-in fade-in-hidden' when not
// Uses CSS opacity transition so switching tabs doesn't trigger a full re-animation
export function useFadeIn(deps = [], delay = 0) {
  const [visible, setVisible] = useState(false)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      // First mount: show quickly
      firstRender.current = false
      const t = setTimeout(() => setVisible(true), delay + 16)
      return () => clearTimeout(t)
    }
    // Re-mount due to dep change: brief hide then show
    setVisible(false)
    const t = setTimeout(() => setVisible(true), delay + 80)
    return () => clearTimeout(t)
  }, deps) // eslint-disable-line

  return visible
}

export function useFadeInOnMount(delay = 0) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [])
  return visible
}