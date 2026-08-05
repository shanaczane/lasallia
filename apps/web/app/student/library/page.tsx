// apps/web/app/student/library/page.tsx
// Sprint 4.5 — My Library (unified tabbed page)
// 4.5.1 Borrowed Books · 4.5.2 Saved · 4.5.3 History
// QR for BORROWING only — lives on catalog detail page
// Fix: all three tabs use a 5-per-row book-card grid (matching the catalog),
//      instead of a table/list. Each tab keeps its own filter pills and the
//      status/date/fine info specific to that tab, shown on the card itself.

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Library, Bookmark, History,
  CheckCircle2, Clock,
  BookOpen, Info, X,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AvailabilityPill } from "@/components/ui/pills/availability-pill"
import { fetchLoans, type Loan as ApiLoan } from "@/lib/kiosk"
import { fetchSavedBooks, unsaveBook } from "@/lib/saved"
import type { Book } from "@lasallia/types"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "borrowed" | "saved" | "history"

type BorrowStatus = "active" | "due_soon" | "overdue"

// No "lost" status here — nothing in this codebase can mark a loan lost
// yet (no UI, no endpoint), so it's not offered as a filter rather than
// faked with a filter that always shows zero results.
type HistoryStatus = "returned" | "overdue_returned"

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
  returned:         { label: "Returned",      shortLabel: "Returned", icon: <CheckCircle2 size={11} />, text: "text-success", bg: "bg-success-bg" },
  overdue_returned: { label: "Returned Late", shortLabel: "Late",     icon: <Clock size={11} />,        text: "text-warn",    bg: "bg-warn-bg"    },
}

// 5 columns at lg — pick a page size that fills whole rows (2 rows/page)
const PAGE_SIZE = 10

// Matches apps/web/app/borrow/[token]/page.tsx — pending real LRC borrow-limit policy
const BORROW_LIMIT_PLACEHOLDER = 3

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

// Small auto-width status badge — overlaid on a card's cover corner
function Badge({
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
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold shadow-sm",
        className,
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
    >
      {icon}
      {label}
    </span>
  )
}

// Deterministic color palette for books without cover images — matches BookCard
const COVER_COLORS = [
  "#1E3A5F", "#5C3D11", "#1B3A2D", "#4A1942",
  "#2C3E50", "#1A1A2E", "#0F4C75", "#154360",
  "#1B2631", "#2E4057", "#3B1F2B", "#1C3144",
]

function getCoverColor(book: Book): string {
  if (book.cover_color) return book.cover_color
  const idx = book.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COVER_COLORS[idx % COVER_COLORS.length]
}

// Book cover — same visual language as the catalog's BookCard (grid texture +
// title overlay on the color block when there's no cover image)
function Cover({ book, children }: { book: Book; children?: React.ReactNode }) {
  const coverColor = getCoverColor(book)

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: "2/3", background: coverColor }}
    >
      {book.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.cover_url}
          alt={`Cover of ${book.title}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="relative w-full h-full flex flex-col justify-end p-3">
          <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id={`mylib-grid-${book.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#mylib-grid-${book.id})`} />
          </svg>
          <p
            className="text-white font-semibold z-10 leading-snug"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-display)" }}
          >
            {book.title}
          </p>
        </div>
      )}
      {children}
    </div>
  )
}

const CARD_GRID = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300 bg-white rounded-[10px] border border-ink-200">
      {icon}
      <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
        {message}
      </p>
    </div>
  )
}

// ─── Borrowed Tab (4.5.1) ─────────────────────────────────────────────────────

type BorrowFilter = "all" | BorrowStatus

const DUE_SOON_DAYS = 3

function deriveBorrowStatus(loan: ApiLoan): BorrowStatus {
  if (loan.status === "overdue") return "overdue"
  const daysLeft = (new Date(loan.due_date).getTime() - Date.now()) / 86_400_000
  return daysLeft <= DUE_SOON_DAYS ? "due_soon" : "active"
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function BorrowedCard({ loan, status }: { loan: ApiLoan; status: BorrowStatus }) {
  const book = loan.books
  const s = BORROW_CFG[status]
  if (!book) return null
  return (
    <Link
      href={`/student/catalog/${book.id}`}
      className="group flex flex-col rounded-(--radius) overflow-hidden bg-white border border-ink-200 shadow-(--shadow-sm) hover:shadow-(--shadow) transition-shadow duration-200"
    >
      <Cover book={book}>
        <div className="absolute top-2 right-2">
          <Badge
            icon={<span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />}
            label={s.label}
            className={cn(s.bg, s.text)}
          />
        </div>
      </Cover>
      <div className="flex flex-col gap-0.5 p-2.5 flex-1">
        <p
          className="text-ink-900 font-semibold leading-snug truncate"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {book.title}
        </p>
        <p
          className="text-ink-400 leading-snug truncate"
          style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
        >
          {book.author}
        </p>
        <p
          className={cn("mt-auto pt-1.5 font-medium", s.text)}
          style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
        >
          Due {formatDate(loan.due_date)}
        </p>
      </div>
    </Link>
  )
}

function BorrowedTab({ loans, loading, error }: { loans: ApiLoan[]; loading: boolean; error: string | null }) {
  const [filter, setFilter] = useState<BorrowFilter>("all")

  const entries = loans
    .filter((loan) => loan.status !== "returned")
    .map((loan) => ({ loan, status: deriveBorrowStatus(loan) }))

  const counts = {
    all:      entries.length,
    active:   entries.filter((x) => x.status === "active").length,
    due_soon: entries.filter((x) => x.status === "due_soon").length,
    overdue:  entries.filter((x) => x.status === "overdue").length,
  }

  const filtered =
    filter === "all" ? entries : entries.filter((x) => x.status === filter)

  const { page, totalPages, pageItems, goTo } = usePagination(filtered, filter)

  const filterBtns: { key: BorrowFilter; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "active",   label: "Active" },
    { key: "due_soon", label: "Due Soon" },
    { key: "overdue",  label: "Overdue" },
  ]

  if (loading) {
    return <EmptyState icon={<BookOpen size={28} />} message="Loading your loans…" />
  }

  if (error) {
    return <EmptyState icon={<BookOpen size={28} />} message={error} />
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Return info — lightweight caption */}
      <p
        className="flex items-start gap-1.5 text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
      >
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          To return a book, bring it to the{" "}
          <span className="font-medium text-ink-600">LRC librarian counter</span> — no QR code needed.
        </span>
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

      {/* Grid */}
      {pageItems.length === 0 ? (
        <EmptyState icon={<BookOpen size={28} />} message="No loans found." />
      ) : (
        <div className={CARD_GRID}>
          {pageItems.map(({ loan, status }) => (
            <BorrowedCard key={loan.id} loan={loan} status={status} />
          ))}
        </div>
      )}

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

function SavedCard({
  book,
  isRemoving,
  onRemove,
}: {
  book: Book
  isRemoving: boolean
  onRemove: () => void
}) {
  const isAvailable = book.status === "available"
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-(--radius) overflow-hidden bg-white border border-ink-200",
        "shadow-(--shadow-sm) hover:shadow-(--shadow) transition-all duration-200",
        isRemoving && "opacity-0 scale-95",
      )}
    >
      <Link href={`/student/catalog/${book.id}`} className="block">
        <Cover book={book}>
          <div className="absolute top-2 left-2">
            <AvailabilityPill
              status={book.status === "misplaced" ? "missing" : book.status}
              className="shadow-sm"
            />
          </div>
        </Cover>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove "${book.title}" from saved`}
        className="absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-black/30 text-white hover:bg-danger transition-colors"
      >
        <X size={13} />
      </button>
      <div className="flex flex-col gap-0.5 p-2.5 flex-1">
        <Link href={`/student/catalog/${book.id}`}>
          <p
            className="text-ink-900 font-semibold leading-snug truncate hover:text-green-700 transition-colors"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            {book.title}
          </p>
        </Link>
        <p
          className="text-ink-400 leading-snug truncate"
          style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
        >
          {book.author}
        </p>
        <Link
          href={`/student/catalog/${book.id}`}
          className={cn(
            "mt-auto w-full text-center py-1.5 rounded-[8px] font-semibold transition-colors",
            isAvailable
              ? "bg-green-700 text-white hover:bg-green-800"
              : "border border-ink-200 text-ink-600 hover:bg-ink-50",
          )}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
        >
          {isAvailable ? "Borrow" : "View"}
        </Link>
      </div>
    </div>
  )
}

function SavedTab({ savedBooks, loading, onRemove }: { savedBooks: Book[]; loading: boolean; onRemove: (bookId: string) => void }) {
  const [removingId, setRemovingId] = useState<string | null>(null)

  const { page, totalPages, pageItems, goTo } = usePagination(savedBooks, savedBooks.length)

  function handleRemove(id: string) {
    setRemovingId(id)
    setTimeout(() => {
      onRemove(id)
      setRemovingId(null)
    }, 200)
  }

  if (loading) {
    return <EmptyState icon={<Bookmark size={28} />} message="Loading your saved books…" />
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

      <div className={CARD_GRID}>
        {pageItems.map((book) => (
          <SavedCard
            key={book.id}
            book={book}
            isRemoving={removingId === book.id}
            onRemove={() => handleRemove(book.id)}
          />
        ))}
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

function deriveHistoryStatus(loan: ApiLoan): HistoryStatus {
  if (loan.returned_at && loan.due_date && new Date(loan.returned_at) > new Date(loan.due_date)) {
    return "overdue_returned"
  }
  return "returned"
}

function HistoryCard({ loan, status }: { loan: ApiLoan; status: HistoryStatus }) {
  const book = loan.books
  const s = HISTORY_CFG[status]
  if (!book) return null
  return (
    <Link
      href={`/student/catalog/${book.id}`}
      className="group flex flex-col rounded-(--radius) overflow-hidden bg-white border border-ink-200 shadow-(--shadow-sm) hover:shadow-(--shadow) transition-shadow duration-200"
    >
      <Cover book={book}>
        <div className="absolute top-2 right-2">
          <Badge icon={s.icon} label={s.shortLabel} className={cn(s.bg, s.text)} />
        </div>
      </Cover>
      <div className="flex flex-col gap-0.5 p-2.5 flex-1">
        <p
          className="text-ink-900 font-semibold leading-snug truncate"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {book.title}
        </p>
        <p
          className="text-ink-400 leading-snug truncate"
          style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
        >
          {book.author}
        </p>
        <p
          className="text-ink-400 pt-1.5"
          style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
        >
          Returned {loan.returned_at ? formatDate(loan.returned_at) : "—"}
        </p>
        {!!loan.fine_amount && (
          <p
            className="text-warn font-semibold"
            style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
          >
            ₱{loan.fine_amount.toFixed(2)} fine{loan.fine_status === "unsettled" ? " (unsettled)" : ""}
          </p>
        )}
      </div>
    </Link>
  )
}

function HistoryTab({ loans }: { loans: ApiLoan[] }) {
  const [filter, setFilter] = useState<HistoryFilter>("all")

  const entries = loans
    .filter((loan) => loan.status === "returned")
    .map((loan) => ({ loan, status: deriveHistoryStatus(loan) }))

  const counts = {
    all:              entries.length,
    returned:         entries.filter((x) => x.status === "returned").length,
    overdue_returned: entries.filter((x) => x.status === "overdue_returned").length,
  }

  const filtered =
    filter === "all" ? entries : entries.filter((x) => x.status === filter)

  const { page, totalPages, pageItems, goTo } = usePagination(filtered, filter)

  const totalFines = entries.reduce((acc, x) => acc + (x.loan.fine_amount ?? 0), 0)

  const filterBtns: { key: HistoryFilter; label: string }[] = [
    { key: "all",              label: "All" },
    { key: "returned",         label: "On Time" },
    { key: "overdue_returned", label: "Late" },
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* Filter pills + total fines */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
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

        {totalFines > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warn-bg border border-warn/20 shrink-0">
            <Clock size={13} className="text-warn shrink-0" />
            <p
              className="text-warn font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              ₱{totalFines.toFixed(2)} in fines from returns
            </p>
          </div>
        )}
      </div>

      {/* Grid */}
      {pageItems.length === 0 ? (
        <EmptyState icon={<History size={28} />} message="No matching transactions." />
      ) : (
        <div className={CARD_GRID}>
          {pageItems.map(({ loan, status }) => (
            <HistoryCard key={loan.id} loan={loan} status={status} />
          ))}
        </div>
      )}

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
        Tap a book to view its full details in the catalog.
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

export default function MyLibraryPage() {
  const [tab, setTab] = useState<Tab>("borrowed")
  const [loans, setLoans] = useState<ApiLoan[]>([])
  const [loansLoading, setLoansLoading] = useState(true)
  const [loansError, setLoansError] = useState<string | null>(null)

  useEffect(() => {
    fetchLoans()
      .then(setLoans)
      .catch((err) => setLoansError(err.message ?? "Failed to load your loans"))
      .finally(() => setLoansLoading(false))
  }, [])

  const [savedBooks, setSavedBooks] = useState<Book[]>([])
  const [savedLoading, setSavedLoading] = useState(true)

  useEffect(() => {
    fetchSavedBooks()
      .then((rows) => setSavedBooks(rows.map((r) => r.books).filter((b): b is Book => !!b)))
      .catch(() => {})
      .finally(() => setSavedLoading(false))
  }, [])

  async function handleUnsave(bookId: string) {
    setSavedBooks((prev) => prev.filter((b) => b.id !== bookId))
    try {
      await unsaveBook(bookId)
    } catch {
      // best-effort — a stale re-fetch would just re-show it if this failed
    }
  }

  const activeLoanCount = loans.filter((l) => l.status !== "returned").length
  const returnedLoanCount = loans.filter((l) => l.status === "returned").length

  const TAB_SUB: Record<Tab, string> = {
    borrowed: `${activeLoanCount} active loan${activeLoanCount === 1 ? "" : "s"} · Limit: ${BORROW_LIMIT_PLACEHOLDER} books`,
    saved:    `${savedBooks.length} book${savedBooks.length === 1 ? "" : "s"} saved`,
    history:  `${returnedLoanCount} past transaction${returnedLoanCount === 1 ? "" : "s"}`,
  }

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
        {tab === "borrowed" && <BorrowedTab loans={loans} loading={loansLoading} error={loansError} />}
        {tab === "saved"    && <SavedTab savedBooks={savedBooks} loading={savedLoading} onRemove={handleUnsave} />}
        {tab === "history"  && <HistoryTab loans={loans} />}
      </div>

    </div>
  )
}
