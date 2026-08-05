// apps/web/components/kiosk/useIdleTimeout.ts
// 90-second inactivity timeout for the kiosk shell (build plan Phase 6).
// Any click/keypress/touch/mouse-move resets the clock, including during
// the "Still here?" warning window — the warning is a UI nudge, not the
// only way to cancel it.

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
        onExpire()
      }
    }, 1000)

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => document.removeEventListener(evt, handleActivity))
      clearInterval(interval)
    }
  }, [enabled, timeoutSeconds, onExpire, reset])

  return { secondsLeft, reset }
}
