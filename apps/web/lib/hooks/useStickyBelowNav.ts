// Makes a tab bar stick below the nav on phones, where CSS `sticky` didn't
// work reliably. A hidden marker shows when the bar has scrolled past the
// nav, and the bar switches to `fixed`. Desktop still uses CSS `sticky`.

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
