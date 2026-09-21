// apps/web/lib/hooks/usePolling.ts
// Runs `fn` now, then every `ms` — but only while the tab is visible, and once
// more the moment it becomes visible again. A hidden tab (another tab in
// front, phone screen off) has nobody to show fresh data to, so polling it
// just spends the API's time.

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
