// apps/web/components/ui/dashboard/ForYouSection.tsx
// Recommendations plan Phase 6 — "For You" section on the student
// dashboard. Reuses components/ui/catalog/BookCard (no second book
// card) with its new optional `reason` prop. Fetches its own data so
// the dashboard page doesn't have to know anything about
// recommendations beyond rendering this component.

"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { BookCard } from "@/components/ui/catalog/BookCard"
import { fetchRecommendations } from "@/lib/recommendations"
import { logEvent, logImpressions } from "@/lib/recommendationEvents"
import type { RecommendationItem, RecommendationsResponse } from "@lasallia/types"

const SKELETON_COUNT = 4

function SkeletonCard() {
  return (
    <div className="w-[140px] lg:w-full shrink-0 rounded-(--radius) overflow-hidden bg-white border border-ink-200 animate-pulse">
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

function CardRow({ children }: { children: React.ReactNode }) {
  // Horizontal scroll on mobile, grid on desktop — this column now takes
  // the larger share of the dashboard row (student/dashboard/page.tsx),
  // so the grid gets more columns than the old fixed w-80 sidebar did.
  return (
    <div className="flex lg:grid lg:grid-cols-3 gap-3 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {children}
    </div>
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

// Recommendations plan Phase 7 — GET /recommendations/me now falls
// through rungs 1 (personal) -> 2 (program) -> 3/4 (library-wide
// popular) server-side, and reports which one actually produced the
// response as `rung`. This is just the header/subtitle copy for each,
// so the section never claims personalization it didn't do.
const RUNG_COPY: Record<RecommendationsResponse["rung"], { title: string; subtitle: string }> = {
  personal: { title: "For You", subtitle: "Based on what you've borrowed." },
  program: { title: "For You", subtitle: "Popular in your program." },
  popular: { title: "Popular at the LRC", subtitle: "Library-wide, not personalized yet." },
}

export function ForYouSection() {
  const [items, setItems] = useState<RecommendationItem[] | null>(null)
  const [rung, setRung] = useState<RecommendationsResponse["rung"]>("personal")
  const [loading, setLoading] = useState(true)
  // Plan 6's error state: "Hide the section entirely. Do not show an
  // error card on a dashboard." — tracked separately from "loaded but
  // empty" so those two cases can render differently.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchRecommendations(8)
      .then((res) => {
        setItems(res.recommendations)
        setRung(res.rung)
        // Phase 9 — one batched call for the whole rendered list, not
        // one per card.
        logImpressions(res.recommendations)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
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
        <p className="text-ink-400" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
          {copy.subtitle}
        </p>
      </div>

      {loading ? (
        <CardRow>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
        </CardRow>
      ) : items && items.length > 0 ? (
        <CardRow>
          {items.map((item) => (
            <BookCard
              key={item.book.id}
              book={item.book}
              // fromRec/rank let the detail page attribute a later
              // reserve action back to this card (Phase 9).
              href={`/student/catalog/${item.book.id}?fromRec=1&rank=${item.rank}`}
              reason={item.reason}
              className="w-[140px] lg:w-full shrink-0"
              onClick={() => logEvent("click", item.book.id, item.rank)}
            />
          ))}
        </CardRow>
      ) : (
        // Only reachable now if the nightly job has never run at all for
        // this account (brand-new, or popular_recommendations itself is
        // empty) — /me's fallthrough (rungs 1-4) means a student with
        // any stored data at all gets real items, not this placeholder.
        <EmptyState
          title="Nothing picked yet"
          subtitle="Borrow a book and we'll start recommending titles based on it."
        />
      )}
    </div>
  )
}
