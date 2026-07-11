// apps/web/app/student/library/page.tsx
// Sprint 4.5 — My Library (unified tabbed page)
// 4.5.1 Borrowed Books · 4.5.2 Saved · 4.5.3 History
// QR for BORROWING only — lives on catalog detail page
// Status badges shortened · layout matches NotificationFeed exactly

"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Library, Bookmark, History,
  CheckCircle2, Clock,
  BookOpen, ChevronDown, ChevronUp, Info,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AvailabilityPill } from "@/components/ui/pills/availability-pill"
import { MOCK_BOOKS } from "@/lib/mock/catalog"
import type { Book } from "@lasallia/types"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "borrowed" | "saved" | "history"

type BorrowStatus = "active" | "due_soon" | "overdue"

type BorrowedEntry = {
  bookId: string
  borrowedDate: string
  dueDate: string
  status: BorrowStatus
}

type HistoryStatus = "returned" | "overdue_returned" | "lost"

type HistoryEntry = {
  bookId: string
  borrowedDate: string
  dueDate: string
  returnedDate: string | null
  status: HistoryStatus
  fine?: number
}

// ─── Status configs ───────────────────────────────────────────────────────────

const BORROW_CFG: Record<
  BorrowStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  active:   { label: "Active",   dot: "bg-success", text: "text-success", bg: "bg-success-bg" },
  due_soon: { label: "Due Soon", dot: "bg-warn",    text: "text-warn",    bg: "bg-warn-bg"    },
  overdue:  { label: "Overdue",  dot: "bg-danger",  text: "text-danger",  bg: "bg-danger-bg"  },
}

const HISTORY_CFG: Record<
  HistoryStatus,
  { label: string; shortLabel: string; icon: React.ReactNode; text: string; bg: string }
> = {
  returned:         { label: "Returned",      shortLabel: "Returned", icon: <CheckCircle2 size={12} />, text: "text-success", bg: "bg-success-bg" },
  overdue_returned: { label: "Returned Late", shortLabel: "Late",     icon: <Clock size={12} />,        text: "text-warn",    bg: "bg-warn-bg"    },
  lost:             { label: "Lost",          shortLabel: "Lost",     icon: <Clock size={12} />,        text: "text-danger",  bg: "bg-danger-bg"  },
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const BORROWED_DATA: BorrowedEntry[] = [
  { bookId: "1", borrowedDate: "Jun 8, 2026",  dueDate: "Jun 22, 2026", status: "overdue"  },
  { bookId: "4", borrowedDate: "Jun 14, 2026", dueDate: "Jun 28, 2026", status: "due_soon" },
  { bookId: "6", borrowedDate: "Jun 17, 2026", dueDate: "Jul 1, 2026",  status: "active"   },
  { bookId: "8", borrowedDate: "Jun 18, 2026", dueDate: "Jul 2, 2026",  status: "active"   },
]

const SAVED_IDS = ["2", "5", "3", "7", "6"]

const HISTORY_DATA: HistoryEntry[] = [
  { bookId: "1", borrowedDate: "May 12, 2026", dueDate: "May 26, 2026", returnedDate: "May 24, 2026", status: "returned" },
  { bookId: "3", borrowedDate: "Apr 28, 2026", dueDate: "May 12, 2026", returnedDate: "May 20, 2026", status: "overdue_returned", fine: 40 },
  { bookId: "4", borrowedDate: "Apr 5, 2026",  dueDate: "Apr 19, 2026", returnedDate: "Apr 18, 2026", status: "returned" },
  { bookId: "6", borrowedDate: "Mar 15, 2026", dueDate: "Mar 29, 2026", returnedDate: "Mar 28, 2026", status: "returned" },
  { bookId: "8", borrowedDate: "Feb 20, 2026", dueDate: "Mar 6, 2026",  returnedDate: "Mar 8, 2026",  status: "overdue_returned", fine: 20 },
]

const PAGE_SIZE = 8

// ─── Pagination hook ──────────────────────────────────────────────────────────

function usePagination<T>(items: T[], resetKey?: unknown) {
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever the source list or a tracked key changes
  // (e.g. when a filter changes). We do this via a derived value so the
  // hook stays self-contained — callers pass `resetKey` (e.g. the filter).
  const clampedPage = Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE)))

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const start      = (clampedPage - 1) * PAGE_SIZE
  const pageItems  = items.slice(start, start + PAGE_SIZE)

  function goTo(n: number) {
    setPage(Math.max(1, Math.min(n, totalPages)))
  }

  // Reset when resetKey changes — call outside render cycle is fine in hooks
  // but to avoid the "update during render" warning we use a ref pattern:
  const [lastKey, setLastKey] = useState(resetKey)
  if (resetKey !== undefined && lastKey !== resetKey) {
    setLastKey(resetKey)
    setPage(1)
  }

  return { page: clampedPage, totalPages, pageItems, goTo }
}

// ─── Paginator component ──────────────────────────────────────────────────────

function Paginator({
  page,
  totalPages,
  goTo,
  totalItems,
}: {
  page: number
  totalPages: number
  goTo: (n: number) => void
  totalItems: number
}) {
  if (totalPages <= 1) return null

  const start = (page - 1) * PAGE_SIZE + 1
  const end   = Math.min(page * PAGE_SIZE, totalItems)

  // Build page number array with ellipsis
  function pageNumbers(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const nums: (number | "…")[] = [1]
    if (page > 3) nums.push("…")
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      nums.push(i)
    }
    if (page < totalPages - 2) nums.push("…")
    nums.push(totalPages)
    return nums
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Range label */}
      <p
        className="text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
      >
        Showing <span className="font-medium text-ink-600">{start}–{end}</span> of{" "}
        <span className="font-medium text-ink-600">{totalItems}</span>
      </p>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-[8px] border transition-colors",
            page === 1
              ? "border-ink-100 text-ink-300 cursor-not-allowed"
              : "border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300",
          )}
        >
          <ChevronLeft size={14} />
        </button>

        {pageNumbers().map((n, i) =>
          n === "…" ? (
            <span
              key={`ellipsis-${i}`}
              className="flex items-center justify-center w-8 h-8 text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => goTo(n as number)}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-[8px] border font-medium transition-colors",
                n === page
                  ? "bg-green-700 border-green-700 text-white font-semibold"
                  : "border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300",
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              {n}
            </button>
          ),
        )}

        <button
          onClick={() => goTo(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-[8px] border transition-colors",
            page === totalPages
              ? "border-ink-100 text-ink-300 cursor-not-allowed"
              : "border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300",
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBook(id: string): Book | undefined {
  return MOCK_BOOKS.find((b) => b.id === id)
}

function MiniCover({ book }: { book: Book }) {
  return (
    <div
      className="shrink-0 rounded-sm"
      style={{ width: 40, height: 56, background: book.cover_color ?? "#1E3A5F" }}
    />
  )
}

function Pill({
  icon,
  label,
  className,
}: {
  icon?: React.ReactNode
  label: string
  className: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold",
        className,
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
    >
      {icon}
      {label}
    </span>
  )
}

// ─── Borrowed Tab (4.5.1) ─────────────────────────────────────────────────────

type BorrowFilter = "all" | BorrowStatus

function BorrowedTab() {
  const [filter, setFilter] = useState<BorrowFilter>("all")

  const entries = BORROWED_DATA
    .map((e) => ({ entry: e, book: getBook(e.bookId) }))
    .filter((x) => !!x.book) as { entry: BorrowedEntry; book: Book }[]

  const counts = {
    all:      entries.length,
    active:   entries.filter((x) => x.entry.status === "active").length,
    due_soon: entries.filter((x) => x.entry.status === "due_soon").length,
    overdue:  entries.filter((x) => x.entry.status === "overdue").length,
  }

  const filtered =
    filter === "all" ? entries : entries.filter((x) => x.entry.status === filter)

  const { page, totalPages, pageItems, goTo } = usePagination(filtered, filter)

  const filterBtns: { key: BorrowFilter; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "active",   label: "Active" },
    { key: "due_soon", label: "Due Soon" },
    { key: "overdue",  label: "Overdue" },
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* Return info — lightweight caption */}
      <p
        className="flex items-center gap-1.5 text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
      >
        <Info size={13} className="shrink-0" />
        To return a book, bring it to the{" "}
        <span className="font-medium text-ink-600">LRC librarian counter</span> — no QR code needed.
      </p>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {filterBtns.map((f) => {
          const isActive = filter === f.key
          const isOverdue = f.key === "overdue" && counts.overdue > 0
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors",
                isActive
                  ? isOverdue
                    ? "bg-danger border-danger text-white font-semibold"
                    : "bg-green-700 border-green-700 text-white font-semibold"
                  : isOverdue
                    ? "bg-white border-danger/30 text-danger hover:bg-danger-bg"
                    : "bg-white border-ink-200 text-ink-600 hover:bg-ink-50",
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              {f.label}
              <span
                className={cn(
                  "flex items-center justify-center rounded-full min-w-[18px] h-[18px] px-1 font-semibold",
                  isActive ? "bg-white/25 text-white" : isOverdue ? "bg-danger-bg text-danger" : "bg-ink-100 text-ink-500",
                )}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">

        {/* Desktop header */}
        <div
          className="hidden sm:grid px-4 py-2.5 border-b border-ink-100 text-ink-400 font-semibold uppercase"
          style={{
            gridTemplateColumns: "1fr 100px 100px 80px",
            fontSize: "var(--text-2xs)",
            letterSpacing: "var(--tracking-caps)",
            fontFamily: "var(--font-body)",
          }}
        >
          <span>Book</span>
          <span>Borrowed</span>
          <span>Due Date</span>
          <span>Status</span>
        </div>

        {pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300">
            <BookOpen size={28} />
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              No loans found.
            </p>
          </div>
        ) : (
          pageItems.map(({ entry, book }) => {
            const s = BORROW_CFG[entry.status]
            return (
              <div
                key={entry.bookId + entry.borrowedDate}
                className="border-b border-ink-100 last:border-b-0"
              >
                {/* Desktop row */}
                <div
                  className="hidden sm:grid items-center px-4 py-3 gap-3"
                  style={{ gridTemplateColumns: "1fr 100px 100px 80px" }}
                >
                  <Link
                    href={`/student/catalog/${book.id}`}
                    className="flex items-center gap-3 min-w-0 group"
                  >
                    <MiniCover book={book} />
                    <div className="min-w-0">
                      <p
                        className="text-ink-900 font-semibold line-clamp-1 group-hover:text-green-700 transition-colors"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                      >
                        {book.title}
                      </p>
                      <p
                        className="text-ink-400 truncate mt-0.5"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                      >
                        {book.author}
                      </p>
                      <p
                        className="text-ink-300 mt-0.5"
                        style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}
                      >
                        {book.call_number}
                      </p>
                    </div>
                  </Link>
                  <span
                    className="text-ink-600"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                  >
                    {entry.borrowedDate}
                  </span>
                  <span
                    className={cn("font-semibold", s.text)}
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                  >
                    {entry.dueDate}
                  </span>
                  <Pill
                    icon={<span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />}
                    label={s.label}
                    className={cn(s.bg, s.text)}
                  />
                </div>

                {/* Mobile card */}
                <div className="sm:hidden flex items-start gap-3 p-4">
                  <Link href={`/student/catalog/${book.id}`} className="shrink-0">
                    <MiniCover book={book} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/student/catalog/${book.id}`}>
                      <p
                        className="text-ink-900 font-semibold line-clamp-2 hover:text-green-700 transition-colors"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                      >
                        {book.title}
                      </p>
                    </Link>
                    <p
                      className="text-ink-400 truncate mt-0.5"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                    >
                      {book.author}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                      <div>
                        <p
                          className="text-ink-400"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                        >
                          Borrowed {entry.borrowedDate}
                        </p>
                        <p
                          className={cn("font-semibold mt-0.5", s.text)}
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                        >
                          Due {entry.dueDate}
                        </p>
                      </div>
                      <Pill
                        icon={<span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />}
                        label={s.label}
                        className={cn(s.bg, s.text)}
                      />
                    </div>
                  </div>
                </div>

              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <Paginator
        page={page}
        totalPages={totalPages}
        goTo={goTo}
        totalItems={filtered.length}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {(["active", "due_soon", "overdue"] as BorrowStatus[]).map((s) => {
          const cfg = BORROW_CFG[s]
          return (
            <span
              key={s}
              className="flex items-center gap-1.5 text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
              {cfg.label}
            </span>
          )
        })}
      </div>

    </div>
  )
}

// ─── Saved Tab (4.5.2) ────────────────────────────────────────────────────────

function SavedTab() {
  const [savedIds, setSavedIds] = useState<string[]>(SAVED_IDS)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const savedBooks = savedIds
    .map((id) => getBook(id))
    .filter(Boolean) as Book[]

  const { page, totalPages, pageItems, goTo } = usePagination(savedBooks, savedBooks.length)

  function handleRemove(id: string) {
    setRemovingId(id)
    setTimeout(() => {
      setSavedIds((prev) => prev.filter((x) => x !== id))
      setRemovingId(null)
    }, 200)
  }

  if (savedBooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-ink-100">
          <Bookmark size={24} className="text-ink-300" />
        </div>
        <div className="text-center">
          <p
            className="text-ink-700 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
          >
            No saved books yet
          </p>
          <p
            className="text-ink-400 mt-1"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Tap the bookmark icon on any book to save it here.
          </p>
        </div>
        <Link
          href="/student/catalog"
          className="px-5 py-2.5 rounded-[10px] bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          Browse the catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p
          className="text-ink-500"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
        >
          {savedBooks.length} {savedBooks.length === 1 ? "book" : "books"} saved
        </p>
        <Link
          href="/student/catalog"
          className="text-green-700 font-medium hover:underline"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          Browse catalog →
        </Link>
      </div>

      <div className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">
        {pageItems.map((book) => {
          const isAvailable = book.status === "available"
          const isRemoving  = removingId === book.id

          return (
            <div
              key={book.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 border-b border-ink-100 last:border-b-0 transition-all duration-200",
                isRemoving && "opacity-0 scale-y-95",
              )}
            >
              {/* Cover */}
              <Link href={`/student/catalog/${book.id}`} className="shrink-0">
                <div
                  className="rounded-sm hover:opacity-90 transition-opacity"
                  style={{ width: 40, height: 56, background: book.cover_color ?? "#1E3A5F" }}
                />
              </Link>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link href={`/student/catalog/${book.id}`}>
                  <p
                    className="text-ink-900 font-semibold line-clamp-1 hover:text-green-700 transition-colors"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    {book.title}
                  </p>
                </Link>
                <p
                  className="text-ink-400 truncate mt-0.5"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                >
                  {book.author}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <AvailabilityPill
                    status={book.status === "misplaced" ? "missing" : book.status}
                  />
                  <span
                    className="text-ink-300 hidden sm:inline"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}
                  >
                    {book.shelf_location}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {isAvailable ? (
                  <Link
                    href={`/student/catalog/${book.id}`}
                    className="px-3 py-1.5 rounded-[8px] bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                  >
                    Borrow
                  </Link>
                ) : (
                  <Link
                    href={`/student/catalog/${book.id}`}
                    className="px-3 py-1.5 rounded-[8px] border border-ink-200 text-ink-600 font-medium hover:bg-ink-50 transition-colors"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                  >
                    View
                  </Link>
                )}
                <button
                  onClick={() => handleRemove(book.id)}
                  aria-label={`Remove "${book.title}" from saved`}
                  className="flex items-center justify-center w-7 h-7 rounded-full text-ink-300 hover:text-danger hover:bg-danger-bg transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <Paginator
        page={page}
        totalPages={totalPages}
        goTo={goTo}
        totalItems={savedBooks.length}
      />

      <p
        className="text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
      >
        Tap <span className="font-semibold text-green-700">Borrow</span> on an available book
        to open its detail page and scan the QR code at the counter.
      </p>

    </div>
  )
}

// ─── History Tab (4.5.3) ──────────────────────────────────────────────────────

type HistoryFilter = "all" | HistoryStatus

function HistoryTab() {
  const [filter, setFilter]         = useState<HistoryFilter>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const entries = HISTORY_DATA
    .map((e) => ({ entry: e, book: getBook(e.bookId) }))
    .filter((x) => !!x.book) as { entry: HistoryEntry; book: Book }[]

  const counts = {
    all:              entries.length,
    returned:         entries.filter((x) => x.entry.status === "returned").length,
    overdue_returned: entries.filter((x) => x.entry.status === "overdue_returned").length,
    lost:             entries.filter((x) => x.entry.status === "lost").length,
  }

  const filtered =
    filter === "all" ? entries : entries.filter((x) => x.entry.status === filter)

  const { page, totalPages, pageItems, goTo } = usePagination(filtered, filter)

  const totalFines = entries.reduce((acc, x) => acc + (x.entry.fine ?? 0), 0)

  const filterBtns: { key: HistoryFilter; label: string }[] = [
    { key: "all",              label: "All" },
    { key: "returned",         label: "On Time" },
    { key: "overdue_returned", label: "Late" },
    { key: "lost",             label: "Lost" },
  ]

  return (
    <div className="flex flex-col gap-4">

      {totalFines > 0 && (
        <div className="flex items-center gap-2 self-start px-3 py-2 rounded-[10px] bg-warn-bg border border-warn/20">
          <Clock size={14} className="text-warn shrink-0" />
          <p
            className="text-warn font-semibold"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            ₱{totalFines}.00 in fines paid
          </p>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {filterBtns.map((f) => {
          const isActive = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors",
                isActive
                  ? "bg-green-700 border-green-700 text-white font-semibold"
                  : "bg-white border-ink-200 text-ink-600 hover:bg-ink-50",
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              {f.label}
              <span
                className={cn(
                  "flex items-center justify-center rounded-full min-w-[18px] h-[18px] px-1 font-semibold",
                  isActive ? "bg-white/25 text-white" : "bg-ink-100 text-ink-500",
                )}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">

        {/* Desktop header */}
        <div
          className="hidden sm:grid px-4 py-2.5 border-b border-ink-100 text-ink-400 font-semibold uppercase"
          style={{
            gridTemplateColumns: "1fr 100px 100px 80px 20px",
            fontSize: "var(--text-2xs)",
            letterSpacing: "var(--tracking-caps)",
            fontFamily: "var(--font-body)",
          }}
        >
          <span>Book</span>
          <span>Borrowed</span>
          <span>Returned</span>
          <span>Status</span>
          <span />
        </div>

        {pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300">
            <History size={28} />
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              No matching transactions.
            </p>
          </div>
        ) : (
          pageItems.map(({ entry, book }) => {
            const s      = HISTORY_CFG[entry.status]
            const rowKey = entry.bookId + entry.borrowedDate
            const isExp  = expandedId === rowKey

            return (
              <div key={rowKey} className="border-b border-ink-100 last:border-b-0">

                {/* Desktop row */}
                <div
                  className="hidden sm:grid items-center px-4 py-3 gap-3 cursor-pointer hover:bg-ink-50 transition-colors"
                  style={{ gridTemplateColumns: "1fr 100px 100px 80px 20px" }}
                  onClick={() => setExpandedId(isExp ? null : rowKey)}
                >
                  <Link
                    href={`/student/catalog/${book.id}`}
                    className="flex items-center gap-3 min-w-0 group"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MiniCover book={book} />
                    <div className="min-w-0">
                      <p
                        className="text-ink-900 font-semibold line-clamp-1 group-hover:text-green-700 transition-colors"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                      >
                        {book.title}
                      </p>
                      <p
                        className="text-ink-400 truncate mt-0.5"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                      >
                        {book.author}
                      </p>
                    </div>
                  </Link>
                  <span
                    className="text-ink-600"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                  >
                    {entry.borrowedDate}
                  </span>
                  <span
                    className="text-ink-600"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                  >
                    {entry.returnedDate ?? "—"}
                  </span>
                  <Pill
                    icon={s.icon}
                    label={s.shortLabel}
                    className={cn(s.bg, s.text)}
                  />
                  <span className="text-ink-300 flex justify-end">
                    {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </div>

                {/* Mobile card */}
                <div
                  className="sm:hidden flex items-start gap-3 p-4 cursor-pointer hover:bg-ink-50 transition-colors"
                  onClick={() => setExpandedId(isExp ? null : rowKey)}
                >
                  <Link
                    href={`/student/catalog/${book.id}`}
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MiniCover book={book} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/student/catalog/${book.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p
                        className="text-ink-900 font-semibold line-clamp-2 hover:text-green-700 transition-colors"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                      >
                        {book.title}
                      </p>
                    </Link>
                    <p
                      className="text-ink-400 truncate mt-0.5"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                    >
                      {book.author}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                      <div>
                        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                          {entry.borrowedDate} → {entry.returnedDate ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Pill icon={s.icon} label={s.shortLabel} className={cn(s.bg, s.text)} />
                        <span className="text-ink-300">
                          {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="px-4 pb-4 pt-3 sm:pl-[68px] bg-ink-50 border-t border-ink-100 flex flex-wrap gap-x-8 gap-y-3">
                    <div>
                      <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
                        Call Number
                      </p>
                      <p className="text-ink-700 mt-0.5" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>
                        {book.call_number}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
                        Due Date
                      </p>
                      <p className="text-ink-700 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                        {entry.dueDate}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
                        Shelf
                      </p>
                      <p className="text-ink-700 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                        {book.shelf_location}
                      </p>
                    </div>
                    {entry.fine !== undefined && (
                      <div>
                        <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
                          Fine Paid
                        </p>
                        <p className="text-warn font-semibold mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                          ₱{entry.fine}.00
                        </p>
                      </div>
                    )}
                    <div className="flex items-end">
                      <Link
                        href={`/student/catalog/${book.id}`}
                        className="text-green-700 font-medium hover:underline"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View in catalog →
                      </Link>
                    </div>
                  </div>
                )}

              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <Paginator
        page={page}
        totalPages={totalPages}
        goTo={goTo}
        totalItems={filtered.length}
      />

      <p
        className="text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
      >
        Tap any row to see transaction details.
      </p>

    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type TabDef = {
  key: Tab
  label: string
  shortLabel: string
  icon: React.ReactNode
}

const TABS: TabDef[] = [
  { key: "borrowed", label: "Borrowed Books", shortLabel: "Borrowed", icon: <Library size={14} /> },
  { key: "saved",    label: "Saved",          shortLabel: "Saved",    icon: <Bookmark size={14} /> },
  { key: "history",  label: "History",        shortLabel: "History",  icon: <History size={14} /> },
]

const TAB_SUB: Record<Tab, string> = {
  borrowed: `${BORROWED_DATA.length} active loans · Limit: 5 books`,
  saved:    `${SAVED_IDS.length} books saved`,
  history:  `${HISTORY_DATA.length} past transactions`,
}

export default function MyLibraryPage() {
  const [tab, setTab] = useState<Tab>("borrowed")

  function TabButton({ t, mobile }: { t: TabDef; mobile: boolean }) {
    const isActive = tab === t.key
    return (
      <button
        type="button"
        onClick={() => setTab(t.key)}
        className={cn(
          "flex items-center gap-1.5 py-2.5 px-3 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
          isActive
            ? "border-green-700 text-green-700"
            : "border-transparent text-ink-500 hover:text-ink-900",
        )}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: mobile ? "var(--text-xs)" : "var(--text-sm-body)",
        }}
      >
        {mobile ? <>{t.icon}{t.shortLabel}</> : t.label}
      </button>
    )
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-paper">

      {/* Header */}
      <div className="px-4 sm:px-8 pt-6 pb-4">
        <h1
          className="text-ink-900 font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
        >
          My Library
        </h1>
        <p
          className="text-ink-500 mt-1"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {TAB_SUB[tab]}
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-ink-200">
        <div className="flex sm:hidden w-full overflow-x-auto px-2 scrollbar-none">
          {TABS.map((t) => <TabButton key={t.key} t={t} mobile={true} />)}
        </div>
        <div className="hidden sm:flex px-8">
          {TABS.map((t) => <TabButton key={t.key} t={t} mobile={false} />)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 sm:px-8 py-5">
        {tab === "borrowed" && <BorrowedTab />}
        {tab === "saved"    && <SavedTab />}
        {tab === "history"  && <HistoryTab />}
      </div>

    </div>
  )
}