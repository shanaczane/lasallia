// apps/web/lib/hooks/useSwipeTabs.ts
// Swipe-to-change-tab, shared by My Library, Notifications, and
// Reservations — the three student pages with a horizontal tab bar over a
// scrollable list. No gesture library in this repo (no framer-motion,
// no @use-gesture) — raw touchstart/touchend is plenty for a one-axis
// swipe-between-tabs gesture.

import { useRef, useState } from "react"

const SWIPE_THRESHOLD_PX = 50
// A drag with more vertical than horizontal movement is a scroll, not a
// tab swipe — bail out rather than fighting the page's own scrolling.
const MAX_VERTICAL_DRIFT_PX = 60

export type SlideDirection = "forward" | "back"

// tabs: the order tab keys appear in the tab bar — swiping left moves
// forward through this list (like flipping to the next page), swiping
// right moves back.
export function useSwipeTabs<T extends string>(tabs: readonly T[], active: T, onChange: (next: T) => void) {
  const [direction, setDirection] = useState<SlideDirection>("forward")
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  function go(step: 1 | -1) {
    const i = tabs.indexOf(active)
    const next = tabs[i + step]
    if (next === undefined) return
    setDirection(step > 0 ? "forward" : "back")
    onChange(next)
  }

  // Also used by TabButton clicks, so tapping a tab slides the same way a
  // swipe to it would have — direction stays meaningful either way.
  function changeTo(next: T) {
    const i = tabs.indexOf(active)
    const nextI = tabs.indexOf(next)
    setDirection(nextI >= i ? "forward" : "back")
    onChange(next)
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX) return
    if (dx <= -SWIPE_THRESHOLD_PX) go(1)
    else if (dx >= SWIPE_THRESHOLD_PX) go(-1)
  }

  return {
    direction,
    changeTo,
    touchHandlers: { onTouchStart, onTouchEnd },
  }
}
