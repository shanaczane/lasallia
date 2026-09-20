// apps/web/lib/hooks/useBodyScrollLock.ts
'use client'

import { useEffect } from 'react'

// Locks body scroll while `active` is true. Measures the scrollbar's actual
// width and pads it back in via padding-right, so removing the scrollbar
// doesn't let page content stretch a few pixels wider to fill the gap it
// left behind (relying on `scrollbar-gutter: stable` alone isn't enough —
// it only reserves the gutter on elements that are themselves scrollable,
// not reliably on html/body once JS has already hidden the overflow).
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPaddingRight
    }
  }, [active])
}
