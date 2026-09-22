// apps/web/lib/hooks/useBodyScrollLock.ts
'use client'

import { useEffect } from 'react'

// Locks body scroll while `active` is true. `scrollbar-gutter: stable` on
// `html` (globals.css) reserves the scrollbar's width up front, so hiding
// it here never changes the viewport width — nothing needs measuring or
// padding back in.
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [active])
}
