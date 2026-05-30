import { useEffect, useRef, useState } from 'react'

// Staggered fade-in for lists of elements
export function useFadeIn(deps = [], delay = 0) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => setVisible(true), delay + 20)
    return () => clearTimeout(t)
  }, deps) // eslint-disable-line

  return visible
}

// For individual elements - returns a ref and whether it's intersecting
export function useFadeInOnMount(delay = 0) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [])
  return visible
}
