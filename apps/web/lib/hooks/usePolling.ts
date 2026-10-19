// Runs `fn` now and every `ms`, but only while the tab is visible (and once
// more when it becomes visible again).

'use client'

import { useEffect, useRef } from 'react'

export function usePolling(fn: () => void, ms: number) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    fnRef.current()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fnRef.current()
    }, ms)
    const onVisible = () => {
      if (document.visibilityState === 'visible') fnRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])
}
