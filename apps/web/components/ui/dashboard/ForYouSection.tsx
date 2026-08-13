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
import type { RecommendationItem } from "@lasallia/types"

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
  // Plan 6: horizontal scroll on mobile, grid on desktop — this sidebar
  // column is narrow even on desktop (w-80 in the dashboard layout), so
  // "grid" here means 2 columns, not a wide multi-column catalog grid.
  return (
    <div className="flex lg:grid lg:grid-cols-2 gap-3 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
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

export function ForYouSection() {
  const [items, setItems] = useState<RecommendationItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  // Plan 6's error state: "Hide the section entirely. Do not show an
  // error card on a dashboard." — tracked separately from "loaded but
  // empty" so those two cases can render differently.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchRecommendations(8)
      .then((res) => setItems(res.recommendations))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  if (failed) return null

  return (
    <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
      <div>
        <h2
          className="text-ink-900 font-semibold"
          style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
        >
          For You
        </h2>
        <p className="text-ink-400" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
          Based on what you&apos;ve borrowed.
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
              href={`/student/catalog/${item.book.id}`}
              reason={item.reason}
              className="w-[140px] lg:w-full shrink-0"
            />
          ))}
        </CardRow>
      ) : (
        // Cold start (no borrow history yet) and "had recommendations
        // but live exclusions removed all of them" both land here for
        // now — plan Phase 7's real fallback ladder (most-borrowed by
        // program/library-wide) isn't built yet, so this is a plain
        // honest placeholder rather than a "Popular at the LRC" claim
        // this section can't actually back up until that phase exists.
        <EmptyState
          title="Nothing picked yet"
          subtitle="Borrow a book and we'll start recommending titles based on it."
        />
      )}
    </div>
  )
}
