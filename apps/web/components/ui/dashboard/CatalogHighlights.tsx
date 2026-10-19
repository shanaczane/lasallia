// Dashboard rows: New Arrivals, and books from the student's program and
// college. Built from the full catalog list.

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { Book } from "@lasallia/types"
import { BookCard } from "@/components/ui/catalog/BookCard"
import { fetchBooks } from "@/lib/books"
import { peekCache, peekMemory, remember } from "@/lib/clientCache"
import { getUser } from "@/lib/auth"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { catalogProgramFor } from "@/lib/catalogProgram"
import { programLabel } from "@/lib/programLabels"
import { ScrollRow } from "./ScrollRow"

const SECTION_SIZE = 12
// Enough placeholder cards to fill a wide screen.
const SKELETON_COUNT = 8
// The catalog isn't per-user, so one copy serves the dashboard and the kiosk.
const BOOKS_CACHE_KEY = "books"

function SkeletonCard() {
  return (
    <div className="w-[140px] shrink-0 rounded-(--radius) overflow-hidden bg-white border border-ink-200 animate-pulse">
      <div className="w-full bg-ink-100" style={{ aspectRatio: "2/3" }} />
      <div className="p-2.5 flex flex-col gap-1.5">
        <div className="h-3 bg-ink-100 rounded w-4/5" />
        <div className="h-2.5 bg-ink-100 rounded w-3/5" />
        <div className="h-2.5 bg-ink-100 rounded w-1/4" />
        <div className="h-5 bg-ink-100 rounded-full w-16 mt-1" />
      </div>
    </div>
  )
}

// "View catalog" card at the end of a row.
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
  hrefPrefix,
}: {
  title: string
  subtitle: string
  loading: boolean
  books: Book[]
  viewMoreHref: string
  hrefPrefix: string
}) {
  // Hide an empty row instead of showing an empty state.
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
        <ScrollRow label={title}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
        </ScrollRow>
      ) : (
        <ScrollRow label={title}>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              href={`${hrefPrefix}/${book.id}`}
              className="w-[140px] shrink-0"
            />
          ))}
          <ViewMoreCard href={viewMoreHref} />
        </ScrollRow>
      )}
    </div>
  )
}

// On the dashboard, the program and college come from the signed-in user.
// The kiosk passes `identity` instead (even with empty fields), so a shared
// kiosk never shows another user's saved details.
export function CatalogHighlights({
  identity,
  hrefPrefix = "/user/catalog",
  // Each row can be turned off (the kiosk hides the college row).
  showProgram = true,
  showCollege = true,
}: {
  identity?: { program: string | null; college: string | null }
  hrefPrefix?: string
  showProgram?: boolean
  showCollege?: boolean
} = {}) {
  // Memory copy from earlier in this visit — instant, no skeletons.
  const [books, setBooks] = useState<Book[] | null>(() => peekMemory<Book[]>(BOOKS_CACHE_KEY) ?? null)
  const [failed, setFailed] = useState(false)
  // Read the user in an effect, since storage doesn't exist during server rendering.
  const [program, setProgram] = useState<string | null>(identity?.program ?? null)
  const [college, setCollege] = useState<string | null>(identity?.college ?? null)

  useEffect(() => {
    let fresh = false
    // After a reload: last copy from this tab, until the fresh one lands.
    Promise.resolve(peekCache<Book[]>(BOOKS_CACHE_KEY)).then((cached) => {
      if (!fresh && cached) setBooks((current) => current ?? cached)
    })
    fetchBooks()
      .then((fetched) => {
        fresh = true
        remember(BOOKS_CACHE_KEY, fetched)
        setBooks(fetched)
      })
      .catch(() => setFailed(true))
    if (identity) return
    const user = getUser()
    setProgram(user?.program ?? null)
    setCollege(user?.college || collegeForProgram(user?.program))
  }, [])

  if (failed) return null

  const loading = books === null

  const newArrivals = books
    ? [...books].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, SECTION_SIZE)
    : []

  // Profile and catalog program names differ ("BS Nursing" vs "Nursing"),
  // so include every catalog program that matches.
  const genres = books ? [...new Set(books.map((b) => b.category))] : []
  const programCategories = new Set(genres.filter((g) => catalogProgramFor(program, [g]) !== null))
  const catalogProgram = catalogProgramFor(program, genres)

  const programBooks = books && programCategories.size > 0
    ? books.filter((b) => programCategories.has(b.category)).slice(0, SECTION_SIZE)
    : []

  // Leave out the student's own program (it has its own row).
  const collegeBooks = books && college
    ? books.filter((b) => b.subject === college && !programCategories.has(b.category)).slice(0, SECTION_SIZE)
    : []

  return (
    <>
      <Section
        title="New Arrivals"
        subtitle="Recently added to the collection."
        loading={loading}
        books={newArrivals}
        hrefPrefix={hrefPrefix}
        viewMoreHref={hrefPrefix}
      />
      {showProgram && !loading && (
          <Section
            title={`From ${programLabel(catalogProgram ?? program ?? "")}`}
            subtitle="Books shelved under your program."
            loading={loading}
            books={programBooks}
            hrefPrefix={hrefPrefix}
            // "genre" is the catalog's URL filter for Program.
            viewMoreHref={`${hrefPrefix}?genre=${encodeURIComponent(catalogProgram ?? "")}`}
          />
      )}
      {showCollege && !loading && (
          <Section
            title={`From ${college ?? ""}`}
            subtitle="More from your college's collection."
            loading={loading}
            books={collegeBooks}
            hrefPrefix={hrefPrefix}
            // "subject" is the catalog's URL filter for College.
            viewMoreHref={`${hrefPrefix}?subject=${encodeURIComponent(college ?? "")}`}
          />
      )}
    </>
  )
}
