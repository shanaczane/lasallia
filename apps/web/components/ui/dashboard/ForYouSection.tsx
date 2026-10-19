// The dashboard's "For You" row. Loads its own recommendations.

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { BookCard } from "@/components/ui/catalog/BookCard"
import { fetchRecommendations } from "@/lib/recommendations"
import { getUser } from "@/lib/auth"
import { peekCache, peekMemory, remember } from "@/lib/clientCache"
import { logEvent, logImpressions } from "@/lib/recommendationEvents"
import type { RecommendationItem, RecommendationsResponse } from "@lasallia/types"
import { ScrollRow } from "./ScrollRow"

// Enough placeholder cards to fill a wide screen.
const SKELETON_COUNT = 8

function SkeletonCard() {
  return (
    <div className="w-[140px] shrink-0 rounded-(--radius) overflow-hidden bg-white border border-ink-200 animate-pulse">
      <div className="w-full bg-ink-100" style={{ aspectRatio: "2/3" }} />
      <div className="p-2.5 flex flex-col gap-1.5">
        <div className="h-3 bg-ink-100 rounded w-4/5" />
        <div className="h-2.5 bg-ink-100 rounded w-3/5" />
        <div className="h-5 bg-ink-100 rounded-full w-16 mt-1" />
        <div className="h-2 bg-ink-100 rounded w-full mt-1" />
      </div>
    </div>
  )
}

// "View catalog" card at the end of the row.
function ViewMoreCard({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="w-[140px] shrink-0 flex flex-col items-center justify-center gap-2 rounded-(--radius) border border-dashed border-ink-300 bg-white hover:bg-ink-50 hover:border-green-700 transition-colors"
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-green-100 text-green-700">
        <ArrowRight size={16} />
      </div>
      <span
        className="text-ink-600 font-medium text-center px-3"
        style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
      >
        View catalog
      </span>
    </Link>
  )
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 p-6 flex flex-col items-center text-center gap-2">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
        <Sparkles size={18} className="text-green-700" />
      </div>
      <p className="text-ink-700 font-semibold" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
        {title}
      </p>
      <p className="text-ink-400" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
        {subtitle}
      </p>
    </div>
  )
}

// Subtitle for each kind of list (personal, program, popular), so the row
// never claims to be personal when it isn't. The title stays the same.
const RUNG_COPY: Record<RecommendationsResponse["rung"], { title: string; subtitle: string }> = {
  personal: { title: "For You", subtitle: "Based on what you've borrowed." },
  program: { title: "For You", subtitle: "Popular in your program." },
  popular: { title: "For You", subtitle: "Picks from around the LRC." },
}

// Cache key for the signed-in user's picks, per account, so a shared browser
// never shows one person's picks to the next. The kiosk passes its own
// fetcher and cacheKey={null}.
function dashboardCacheKey(): string | null {
  const id = typeof window === "undefined" ? null : getUser()?.id
  return id ? `recs:${id}` : null
}

export function ForYouSection({
  fetcher = () => fetchRecommendations(12),
  hrefPrefix = "/user/catalog",
  cacheKey = dashboardCacheKey,
}: {
  fetcher?: () => Promise<RecommendationsResponse>
  hrefPrefix?: string
  cacheKey?: (() => string | null) | null
} = {}) {
  // Show the last picks at once when coming back to the dashboard.
  const [initial] = useState(() => {
    const key = cacheKey?.()
    return key ? peekMemory<RecommendationsResponse>(key) : undefined
  })
  const [items, setItems] = useState<RecommendationItem[] | null>(initial?.recommendations ?? null)
  const [rung, setRung] = useState<RecommendationsResponse["rung"]>(initial?.rung ?? "personal")
  const [loading, setLoading] = useState(!initial)
  // On error, hide the row (no error card on the dashboard).
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Guard against React dev mode running this twice (double logging).
    let cancelled = false
    let fresh = false
    const key = cacheKey?.() ?? null
    // After a reload: last copy from this tab, until the fresh one lands.
    if (key && !initial) {
      Promise.resolve(peekCache<RecommendationsResponse>(key)).then((cached) => {
        if (cancelled || fresh || !cached) return
        setItems(cached.recommendations)
        setRung(cached.rung)
        setLoading(false)
      })
    }
    fetcher()
      .then((res) => {
        if (cancelled) return
        fresh = true
        if (key) remember(key, res)
        setItems(res.recommendations)
        setRung(res.rung)
        // One logging call for the whole row.
        logImpressions(res.recommendations)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (failed) return null

  const copy = RUNG_COPY[rung]

  return (
    <div className="w-full flex flex-col gap-3">
      <div>
        <h2
          className="text-ink-900 font-semibold"
          style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
        >
          {copy.title}
        </h2>
        {/* Hidden until loaded, so the wrong subtitle doesn't flash. */}
        <p
          className={cn("text-ink-400", loading && "invisible")}
          style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
          aria-hidden={loading || undefined}
        >
          {copy.subtitle}
        </p>
      </div>

      {loading ? (
        <ScrollRow label={copy.title}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
        </ScrollRow>
      ) : items && items.length > 0 ? (
        <ScrollRow label={copy.title}>
          {items.map((item) => (
            <BookCard
              key={item.book.id}
              book={item.book}
              // Lets the book page credit a reservation to this card.
              href={`${hrefPrefix}/${item.book.id}?fromRec=1&rank=${item.rank}`}
              // Popular picks all say "Popular at the LRC", so skip it.
              reason={rung === "popular" ? undefined : item.reason}
              className="w-[140px] shrink-0"
              onClick={() => logEvent("click", item.book.id, item.rank)}
            />
          ))}
          <ViewMoreCard href={hrefPrefix} />
        </ScrollRow>
      ) : (
        // Only when there are no recommendations at all yet.
        <EmptyState
          title="Nothing picked yet"
          subtitle="Borrow a book and we'll start recommending titles based on it."
        />
      )}
    </div>
  )
}
