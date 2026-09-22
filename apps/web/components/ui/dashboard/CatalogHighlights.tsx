// apps/web/components/ui/dashboard/CatalogHighlights.tsx
// Sprint 5.7 — extra dashboard sections beyond "Recommended for You":
// New Arrivals, and the student's own Program/College. All three are
// derived client-side from the same full-catalog fetch the student
// catalog page already uses (apps/api's /books is a small, one-shot,
// client-filtered list — see apps/api/routers/books.py's own comment on
// that) rather than needing a dedicated recommendations pipeline.

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { Book } from "@lasallia/types"
import { BookCard } from "@/components/ui/catalog/BookCard"
import { fetchBooks } from "@/lib/books"
import { getUser } from "@/lib/auth"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { programLabel } from "@/lib/programLabels"

const SECTION_SIZE = 12
const SKELETON_COUNT = 4

function SkeletonCard() {
  return (
    <div className="w-[140px] shrink-0 rounded-(--radius) overflow-hidden bg-white border border-ink-200 animate-pulse">
      <div className="w-full bg-ink-100" style={{ aspectRatio: "2/3" }} />
      <div className="p-2.5 flex flex-col gap-1.5">
        <div className="h-3 bg-ink-100 rounded w-4/5" />
        <div className="h-2.5 bg-ink-100 rounded w-3/5" />
        <div className="h-5 bg-ink-100 rounded-full w-16 mt-1" />
      </div>
    </div>
  )
}

function CardRow({ children }: { children: React.ReactNode }) {
  // Always a single horizontally-scrolling row, at every breakpoint — no
  // grid wrap into extra rows on wide screens. no-scrollbar (globals.css,
  // already used by FilterChips.tsx) hides the browser's own scrollbar
  // chrome — its styling varies by OS/browser and isn't reliably
  // reskinnable via ::-webkit-scrollbar, so hiding it is the consistent
  // choice. The row still scrolls fine by drag, trackpad, or wheel.
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
      {children}
    </div>
  )
}

// End-of-row card linking back to the catalog (optionally pre-filtered) —
// same height as the book cards beside it via the row's default flex
// stretch, so it reads as part of the row, not a stray button after it.
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

function Section({
  title,
  subtitle,
  loading,
  books,
  viewMoreHref,
}: {
  title: string
  subtitle: string
  loading: boolean
  books: Book[]
  viewMoreHref: string
}) {
  // Supplementary sections, same rule Phase 6 set for "For You": nothing
  // to show yet is not an error — just don't render the section rather
  // than filling the dashboard with empty-state cards.
  if (!loading && books.length === 0) return null

  return (
    <div className="w-full flex flex-col gap-3">
      <div>
        <h2
          className="text-ink-900 font-semibold"
          style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        <p className="text-ink-400" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
          {subtitle}
        </p>
      </div>

      {loading ? (
        <CardRow>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
        </CardRow>
      ) : (
        <CardRow>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              href={`/student/catalog/${book.id}`}
              className="w-[140px] shrink-0"
            />
          ))}
          <ViewMoreCard href={viewMoreHref} />
        </CardRow>
      )}
    </div>
  )
}

export function CatalogHighlights() {
  const [books, setBooks] = useState<Book[] | null>(null)
  const [failed, setFailed] = useState(false)
  // getUser() reads localStorage, which doesn't exist during Next's SSR
  // pass of this client component — has to run post-hydration, in an
  // effect, same reasoning as student/dashboard/page.tsx's firstName.
  const [program, setProgram] = useState<string | null>(null)
  const [college, setCollege] = useState<string | null>(null)

  useEffect(() => {
    fetchBooks()
      .then(setBooks)
      .catch(() => setFailed(true))
    const user = getUser()
    setProgram(user?.program ?? null)
    setCollege(user?.college || collegeForProgram(user?.program))
  }, [])

  if (failed) return null

  const loading = books === null

  const newArrivals = books
    ? [...books].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, SECTION_SIZE)
    : []

  const programBooks = books && program
    ? books.filter((b) => b.category === program).slice(0, SECTION_SIZE)
    : []

  // Excludes the student's own program so this section reads as "the rest
  // of your college", not a re-list of the section right above it.
  const collegeBooks = books && college
    ? books.filter((b) => b.subject === college && b.category !== program).slice(0, SECTION_SIZE)
    : []

  return (
    <>
      <Section
        title="New Arrivals"
        subtitle="Recently added to the collection."
        loading={loading}
        books={newArrivals}
        viewMoreHref="/student/catalog"
      />
      <Section
        title={`From ${programLabel(program)}`}
        subtitle="Books shelved under your program."
        loading={loading}
        books={programBooks}
        // genre is the catalog filter's own param name for Program (see
        // useCatalogFilters.ts) — pre-filters the catalog to match.
        viewMoreHref={`/student/catalog?genre=${encodeURIComponent(program ?? "")}`}
      />
      <Section
        title={`From ${college ?? ""}`}
        subtitle="More from your college's collection."
        loading={loading}
        books={collegeBooks}
        // subject is the catalog filter's own param name for College.
        viewMoreHref={`/student/catalog?subject=${encodeURIComponent(college ?? "")}`}
      />
    </>
  )
}
