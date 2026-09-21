// apps/web/lib/hooks/useStickyBelowNav.ts
// JS-driven replacement for `position: sticky` on the phone-width tab
// bars (My Library / Notifications / Reservations) — native sticky
// wasn't reliably engaging at phone widths in testing even after ruling
// out the usual overflow/stacking-context causes, and plain
// `position: fixed` overlaps the header above it because fixed has no
// concept of "wait until you'd scroll past me, then stick" the way
// sticky does. This reimplements that waiting behavior with an
// IntersectionObserver watching a zero-height sentinel placed right
// where the bar naturally sits — once the sentinel scrolls above the
// nav, the bar switches to `fixed`; scroll back down and it returns to
// its normal-flow position. Desktop keeps plain CSS `sticky` untouched.

import { useEffect, useRef, useState } from "react"

export function useStickyBelowNav(offsetPx: number) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { rootMargin: `-${offsetPx}px 0px 0px 0px`, threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [offsetPx])

  return { sentinelRef, isStuck }
}
