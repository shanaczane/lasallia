// Kiosk 90-second idle timeout. Any click, key, touch or mouse move resets
// it, even during the "Still here?" warning.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart'] as const

export function useIdleTimeout({
  enabled,
  timeoutSeconds,
  onExpire,
}: {
  enabled: boolean
  timeoutSeconds: number
  onExpire: () => void
}): { secondsLeft: number; reset: () => void } {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds)
  const lastActivityRef = useRef(Date.now())
  const expiredRef = useRef(false)
  // Keep the latest callback in a ref, so a new function each render
  // doesn't restart the timer.
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now()
    expiredRef.current = false
    setSecondsLeft(timeoutSeconds)
  }, [timeoutSeconds])

  useEffect(() => {
    if (!enabled) return
    reset()

    function handleActivity() {
      lastActivityRef.current = Date.now()
    }
    ACTIVITY_EVENTS.forEach((evt) => document.addEventListener(evt, handleActivity))

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000)
      const left = Math.max(0, timeoutSeconds - elapsed)
      setSecondsLeft(left)
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpireRef.current()
      }
    }, 1000)

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, handleActivity))
      clearInterval(interval)
    }
  }, [enabled, timeoutSeconds, reset])

  return { secondsLeft, reset }
}
