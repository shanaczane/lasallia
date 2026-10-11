// components/ui/dashboard/ScrollRow.tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Single horizontally-scrolling row of cards. The browser scrollbar stays
// hidden (no-scrollbar — its look varies by OS and can't be reliably
// restyled), so mouse users get ‹ › buttons instead: a plain wheel only
// scrolls vertically, which left these rows stuck past the first few cards.
// Touch screens keep native swipe and never see the buttons. Edge fades
// hint that more cards sit off-screen; each button and fade only shows
// while there's something to scroll toward on that side.
export function ScrollRow({
  children,
  label,
}: {
  children: React.ReactNode
  /** Names the row for the arrow buttons' screen-reader labels. */
  label?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    // 1px slack — fractional widths can leave scrollLeft a hair short of the end.
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    update()
    el.addEventListener("scroll", update, { passive: true })
    // Width changes (window resize) and content changes (skeletons
    // swapping for real cards) both change whether the row overflows.
    const resize = new ResizeObserver(update)
    resize.observe(el)
    const mutation = new MutationObserver(update)
    mutation.observe(el, { childList: true })
    return () => {
      el.removeEventListener("scroll", update)
      resize.disconnect()
      mutation.disconnect()
    }
  }, [update])

  function scrollByPage(direction: 1 | -1) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" })
  }

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(hover:hover)_and_(pointer:fine)]:flex items-center justify-center size-9 rounded-full bg-white border border-ink-200 text-ink-700 shadow-(--shadow) hover:bg-ink-50 hover:text-ink-900 transition-colors"

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory [&>*]:snap-start"
      >
        {children}
      </div>

      {/* Edge fades — paper-colored so they blend into the dashboard background */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r from-paper to-transparent transition-opacity",
          canLeft ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-paper to-transparent transition-opacity",
          canRight ? "opacity-100" : "opacity-0",
        )}
      />

      {canLeft && (
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          aria-label={label ? `Scroll ${label} left` : "Scroll left"}
          className={cn(arrowClass, "left-1")}
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          aria-label={label ? `Scroll ${label} right` : "Scroll right"}
          className={cn(arrowClass, "right-1")}
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}
