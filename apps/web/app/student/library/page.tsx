// apps/web/app/student/library/page.tsx
// Sprint 4.5 — My Library (unified tabbed page)
// Tabs: Borrowed Books (4.5.1) · Saved (4.5.2) · History (4.5.3) · QR Modal (4.5.4)

"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Library,
  Bookmark,
  History,
  QrCode,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Search,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AvailabilityPill } from "@/components/ui/pills/availability-pill"
import type { Book } from "@lasallia/types"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "borrowed" | "saved" | "history"

type BorrowStatus = "active" | "due_soon" | "overdue"

type BorrowedBook = {
  id: string
  title: string
  author: string
  callNumber: string
  borrowedDate: string
  dueDate: string
  status: BorrowStatus
  coverColor: string
  qrValue: string
}

type HistoryStatus = "returned" | "overdue_returned" | "lost"

type HistoryEntry = {
  id: string
  title: string
  author: string
  callNumber: string
  coverColor: string
  borrowedDate: string
  dueDate: string
  returnedDate: string | null
  status: HistoryStatus
  fine?: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BORROW_STATUS_CONFIG: Record<
  BorrowStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  active:   { label: "Active",   dot: "bg-success", text: "text-success", bg: "bg-success-bg" },
  due_soon: { label: "Due Soon", dot: "bg-warn",    text: "text-warn",    bg: "bg-warn-bg"    },
  overdue:  { label: "Overdue",  dot: "bg-danger",  text: "text-danger",  bg: "bg-danger-bg"  },
}

const HISTORY_STATUS_CONFIG: Record<
  HistoryStatus,
  { label: string; icon: React.ReactNode; text: string; bg: string }
> = {
  returned:         { label: "Returned",      icon: <CheckCircle2 size={13} />, text: "text-success", bg: "bg-success-bg" },
  overdue_returned: { label: "Returned Late", icon: <Clock size={13} />,        text: "text-warn",    bg: "bg-warn-bg"    },
  lost:             { label: "Lost",          icon: <Clock size={13} />,        text: "text-danger",  bg: "bg-danger-bg"  },
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_BORROWED: BorrowedBook[] = [
  { id: "1", title: "Clean Code",                          author: "Robert C. Martin",        callNumber: "005.133 M377c", borrowedDate: "Jun 8, 2026",  dueDate: "Jun 22, 2026", status: "overdue",  coverColor: "#1E3A5F", qrValue: "LASALLIA-COPY-001-BK001" },
  { id: "2", title: "The Pragmatic Programmer",            author: "David Thomas · Hunt",     callNumber: "005.1 T369p",   borrowedDate: "Jun 14, 2026", dueDate: "Jun 28, 2026", status: "due_soon", coverColor: "#1B3A2D", qrValue: "LASALLIA-COPY-002-BK004" },
  { id: "3", title: "Computer Networks, 6th Ed.",          author: "Andrew Tanenbaum",        callNumber: "004.6 T163c",   borrowedDate: "Jun 17, 2026", dueDate: "Jul 1, 2026",  status: "active",   coverColor: "#4A1942", qrValue: "LASALLIA-COPY-003-BK007" },
  { id: "4", title: "Designing Data-Intensive Applications", author: "Martin Kleppmann",      callNumber: "005.74 K64d",   borrowedDate: "Jun 18, 2026", dueDate: "Jul 2, 2026",  status: "active",   coverColor: "#2C3E50", qrValue: "LASALLIA-COPY-004-BK008" },
]

const MOCK_SAVED: Book[] = [
  { id: "s1", title: "Clean Architecture",                    author: "Robert C. Martin",    call_number: "005.12 M377ca", category: "CS", subject: "Architecture",      shelf_location: "Floor 2 · Aisle 3", status: "borrowed",  cover_color: "#5C3D11", published_year: 2017, created_at: "", updated_at: "" },
  { id: "s2", title: "Artificial Intelligence: A Modern Approach", author: "Russell · Norvig", call_number: "006.3 R961a", category: "CS", subject: "AI",             shelf_location: "Floor 3 · Aisle 1", status: "available", cover_color: "#3D3B1F", published_year: 2020, created_at: "", updated_at: "" },
  { id: "s3", title: "Database System Concepts",              author: "Abraham Silberschatz", call_number: "005.74 S582d", category: "CS", subject: "Databases",         shelf_location: "Floor 2 · Aisle 5", status: "available", cover_color: "#2E1A47", published_year: 2019, created_at: "", updated_at: "" },
  { id: "s4", title: "Operating System Concepts",             author: "Abraham Silberschatz", call_number: "005.43 S582o", category: "CS", subject: "Operating Systems", shelf_location: "Floor 2 · Aisle 5", status: "reserved",  cover_color: "#1A2540", published_year: 2018, created_at: "", updated_at: "" },
  { id: "s5", title: "Introduction to Algorithms",            author: "Thomas H. Cormen",    call_number: "005.1 C812i",  category: "CS", subject: "Algorithms",        shelf_location: "Floor 2 · Aisle 4", status: "available", cover_color: "#1C3144", published_year: 2022, created_at: "", updated_at: "" },
]

const MOCK_HISTORY: HistoryEntry[] = [
  { id: "h1", title: "Clean Code",               author: "Robert C. Martin",    callNumber: "005.133 M377c", coverColor: "#1E3A5F", borrowedDate: "May 12, 2026", dueDate: "May 26, 2026", returnedDate: "May 24, 2026", status: "returned" },
  { id: "h2", title: "Refactoring",              author: "Martin Fowler",       callNumber: "005.133 F786r", coverColor: "#1B3A2D", borrowedDate: "Apr 28, 2026", dueDate: "May 12, 2026", returnedDate: "May 20, 2026", status: "overdue_returned", fine: 40 },
  { id: "h3", title: "The Pragmatic Programmer", author: "David Thomas · Hunt", callNumber: "005.1 T369p",  coverColor: "#4A1942", borrowedDate: "Apr 5, 2026",  dueDate: "Apr 19, 2026", returnedDate: "Apr 18, 2026", status: "returned" },
  { id: "h4", title: "Introduction to Algorithms", author: "Thomas H. Cormen", callNumber: "005.1 C812i",  coverColor: "#1C3144", borrowedDate: "Mar 15, 2026", dueDate: "Mar 29, 2026", returnedDate: "Mar 28, 2026", status: "returned" },
  { id: "h5", title: "Database System Concepts", author: "Abraham Silberschatz", callNumber: "005.74 S582d", coverColor: "#2E1A47", borrowedDate: "Feb 20, 2026", dueDate: "Mar 6, 2026",  returnedDate: "Mar 8, 2026",  status: "overdue_returned", fine: 20 },
]

// ─── QR Modal (4.5.4) ─────────────────────────────────────────────────────────

function QRModal({ book, onClose }: { book: BorrowedBook; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center p-4"
      style={{ background: "rgba(20,21,15,0.55)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-(--radius-lg) shadow-(--shadow-lg) w-full max-w-xs p-6 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between">
          <p className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
            Scan to Return
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-ink-100 text-ink-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="w-full flex gap-3 p-3 bg-ink-50 rounded-(--radius) border border-ink-100">
          <div className="shrink-0 rounded-sm" style={{ width: 36, height: 50, background: book.coverColor }} />
          <div className="min-w-0">
            <p className="text-ink-900 font-semibold leading-snug line-clamp-2" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              {book.title}
            </p>
            <p className="text-ink-400 mt-0.5" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
              {book.callNumber}
            </p>
          </div>
        </div>

        {/* QR placeholder — replaced by qrcode.react in Sprint 7.1.1 */}
        <div
          className="flex flex-col items-center justify-center rounded-(--radius) border-2 border-dashed border-ink-200 bg-ink-50"
          style={{ width: "var(--width-qr-frame)", height: "var(--height-qr-frame)" }}
        >
          <QrCode size={52} className="text-ink-300" />
          <p className="text-ink-400 mt-2 text-center px-4" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
            {book.qrValue}
          </p>
        </div>

        <p className="text-ink-500 text-center" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
          Show this to the librarian counter to process your return.
        </p>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-(--radius) bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ─── Borrowed Tab (4.5.1) ─────────────────────────────────────────────────────

type BorrowFilterKey = "all" | "active" | "due_soon" | "overdue"

function BorrowedTab({ onShowQR }: { onShowQR: (b: BorrowedBook) => void }) {
  const [filter, setFilter] = useState<BorrowFilterKey>("all")

  const counts = {
    all:      MOCK_BORROWED.length,
    active:   MOCK_BORROWED.filter((b) => b.status === "active").length,
    due_soon: MOCK_BORROWED.filter((b) => b.status === "due_soon").length,
    overdue:  MOCK_BORROWED.filter((b) => b.status === "overdue").length,
  }
  const filtered = filter === "all" ? MOCK_BORROWED : MOCK_BORROWED.filter((b) => b.status === filter)
  const borrowFilters: { key: BorrowFilterKey; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "active",   label: "Active" },
    { key: "due_soon", label: "Due Soon" },
    { key: "overdue",  label: "Overdue" },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Overdue banner */}
      {counts.overdue > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-(--radius) bg-danger-bg border border-danger/20">
          <AlertTriangle size={17} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-danger font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              {counts.overdue} {counts.overdue === 1 ? "book is" : "books are"} overdue
            </p>
            <p className="text-danger/80 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              Please return them to avoid fines. Show your QR code at the counter.
            </p>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {borrowFilters.map((f) => {
          const isActive = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-pill border whitespace-nowrap transition-colors",
                isActive ? "bg-green-700 border-green-700 text-white font-medium" : "bg-white border-ink-200 text-ink-700 hover:bg-ink-50"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              {f.label}
              <span
                className={cn("flex items-center justify-center rounded-full min-w-5 h-5 px-1 font-semibold", isActive ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500")}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
        {/* Desktop header */}
        <div
          className="hidden sm:flex items-center px-4 py-2.5 border-b border-ink-100 text-ink-400 uppercase font-semibold"
          style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
        >
          <span className="flex-1">Book</span>
          <span className="w-28">Borrowed</span>
          <span className="w-28">Due Date</span>
          <span className="w-24">Status</span>
          <span className="w-24"></span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <BookOpen size={30} className="text-ink-200" />
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              No {filter === "all" ? "" : filter.replace("_", " ")} loans.
            </p>
          </div>
        ) : (
          filtered.map((book) => {
            const s = BORROW_STATUS_CONFIG[book.status]
            return (
              <div key={book.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 border-b border-ink-100 last:border-b-0">
                {/* Cover + info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="shrink-0 rounded-sm" style={{ width: 40, height: 56, background: book.coverColor }} />
                  <div className="min-w-0">
                    <p className="text-ink-900 font-semibold line-clamp-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{book.title}</p>
                    <p className="text-ink-400 truncate mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>{book.author}</p>
                    <p className="text-ink-300 mt-0.5" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{book.callNumber}</p>
                  </div>
                </div>
                {/* Dates + status */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 sm:gap-0 ml-[52px] sm:ml-0">
                  <span className="sm:w-28 text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{book.borrowedDate}</span>
                  <span className={cn("sm:w-28 font-semibold", s.text)} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{book.dueDate}</span>
                  <span className="sm:w-24">
                    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill font-semibold", s.bg, s.text)} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
                      {s.label}
                    </span>
                  </span>
                </div>
                {/* QR button */}
                <button
                  onClick={() => onShowQR(book)}
                  className="flex items-center gap-2 self-start sm:self-center px-3 py-2 rounded-(--radius) border border-ink-200 text-ink-700 font-medium hover:bg-ink-50 transition-colors shrink-0 ml-[52px] sm:ml-0"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                >
                  <QrCode size={14} />
                  Show QR
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {(["active", "due_soon", "overdue"] as BorrowStatus[]).map((s) => {
          const cfg = BORROW_STATUS_CONFIG[s]
          return (
            <span key={s} className="flex items-center gap-1.5 text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
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
  const [saved, setSaved] = useState<Book[]>(MOCK_SAVED)
  const [removingId, setRemovingId] = useState<string | null>(null)

  function handleRemove(id: string) {
    setRemovingId(id)
    setTimeout(() => {
      setSaved((prev) => prev.filter((b) => b.id !== id))
      setRemovingId(null)
    }, 200)
  }

  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-ink-100">
          <Bookmark size={28} className="text-ink-300" />
        </div>
        <div className="text-center">
          <p className="text-ink-700 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>No saved books yet</p>
          <p className="text-ink-400 mt-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>Tap the bookmark icon on any book to save it here.</p>
        </div>
        <Link
          href="/student/catalog"
          className="mt-2 px-5 py-2.5 rounded-(--radius) bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          Browse the catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
          {saved.length} {saved.length === 1 ? "book" : "books"} saved · hover a card to remove
        </p>
        <Link
          href="/student/catalog"
          className="flex items-center gap-1.5 text-green-700 font-medium hover:underline"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <Search size={13} />
          Browse catalog
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {saved.map((book) => (
          <div
            key={book.id}
            className={cn("transition-opacity duration-200", removingId === book.id ? "opacity-0" : "opacity-100")}
          >
            <div className="group relative flex flex-col rounded-(--radius) bg-white border border-ink-200 shadow-(--shadow-sm) hover:shadow-(--shadow) transition-shadow overflow-hidden">
              {/* Remove button */}
              <button
                onClick={() => handleRemove(book.id)}
                aria-label={`Remove "${book.title}" from saved`}
                className="absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-black/30 text-white hover:bg-danger transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 size={12} />
              </button>

              {/* Cover */}
              <Link href={`/student/catalog/${book.id}`}>
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "2/3", background: book.cover_color ?? "#1E3A5F" }}>
                  <div className="relative w-full h-full flex flex-col justify-between p-3">
                    <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <pattern id={`sg-${book.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill={`url(#sg-${book.id})`} />
                    </svg>
                    <p className="text-white/70 uppercase font-semibold z-10 leading-tight" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-author)", fontFamily: "var(--font-body)" }}>
                      {book.author.length > 26 ? book.author.slice(0, 26) + "…" : book.author}
                    </p>
                    <p className="text-white font-semibold z-10 leading-snug" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-display)" }}>
                      {book.title}
                    </p>
                  </div>
                </div>
              </Link>

              {/* Meta */}
              <div className="flex flex-col gap-1 p-3 flex-1">
                <p className="text-ink-900 font-semibold leading-snug line-clamp-2" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>{book.title}</p>
                <p className="text-ink-400 truncate" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>{book.author}</p>
                {book.published_year && (
                  <p className="text-ink-300" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>{book.published_year}</p>
                )}
                <div className="mt-auto pt-2">
                  <AvailabilityPill status={book.status === "misplaced" ? "missing" : book.status} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── History Tab (4.5.3) ──────────────────────────────────────────────────────

type HistoryFilterKey = "all" | "returned" | "overdue_returned" | "lost"

function HistoryTab() {
  const [filter, setFilter] = useState<HistoryFilterKey>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const counts = {
    all:              MOCK_HISTORY.length,
    returned:         MOCK_HISTORY.filter((h) => h.status === "returned").length,
    overdue_returned: MOCK_HISTORY.filter((h) => h.status === "overdue_returned").length,
    lost:             MOCK_HISTORY.filter((h) => h.status === "lost").length,
  }
  const filtered = filter === "all" ? MOCK_HISTORY : MOCK_HISTORY.filter((h) => h.status === filter)
  const totalFines = MOCK_HISTORY.reduce((acc, h) => acc + (h.fine ?? 0), 0)

  const historyFilters: { key: HistoryFilterKey; label: string }[] = [
    { key: "all",              label: "All" },
    { key: "returned",         label: "On Time" },
    { key: "overdue_returned", label: "Returned Late" },
    { key: "lost",             label: "Lost" },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Fines summary */}
      {totalFines > 0 && (
        <div className="flex items-center gap-2 self-start px-4 py-2.5 rounded-(--radius) bg-warn-bg border border-warn/20">
          <Clock size={14} className="text-warn shrink-0" />
          <p className="text-warn font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            ₱{totalFines}.00 in fines paid
          </p>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {historyFilters.map((f) => {
          const isActive = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-pill border whitespace-nowrap transition-colors",
                isActive ? "bg-green-700 border-green-700 text-white font-medium" : "bg-white border-ink-200 text-ink-700 hover:bg-ink-50"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              {f.label}
              <span
                className={cn("flex items-center justify-center rounded-full min-w-5 h-5 px-1 font-semibold", isActive ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500")}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
        <div
          className="hidden sm:flex items-center px-4 py-2.5 border-b border-ink-100 text-ink-400 uppercase font-semibold"
          style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
        >
          <span className="flex-1">Book</span>
          <span className="w-32">Borrowed</span>
          <span className="w-32">Returned</span>
          <span className="w-32">Status</span>
          <span className="w-6"></span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <History size={30} className="text-ink-200" />
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No matching transactions found.</p>
          </div>
        ) : (
          filtered.map((entry) => {
            const s = HISTORY_STATUS_CONFIG[entry.status]
            const isExpanded = expandedId === entry.id
            return (
              <div key={entry.id} className="border-b border-ink-100 last:border-b-0">
                <div
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 cursor-pointer hover:bg-ink-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="shrink-0 rounded-sm" style={{ width: 40, height: 56, background: entry.coverColor }} />
                    <div className="min-w-0">
                      <p className="text-ink-900 font-semibold line-clamp-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{entry.title}</p>
                      <p className="text-ink-400 truncate mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>{entry.author}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 sm:gap-0 ml-[52px] sm:ml-0">
                    <span className="sm:w-32 text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{entry.borrowedDate}</span>
                    <span className="sm:w-32 text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{entry.returnedDate ?? "—"}</span>
                    <span className="sm:w-32">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill font-semibold", s.bg, s.text)} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                        {s.icon}{s.label}
                      </span>
                    </span>
                  </div>
                  <span className="hidden sm:flex text-ink-300 shrink-0">
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </span>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 ml-[52px] flex flex-wrap gap-5 bg-ink-50 border-t border-ink-100">
                    <div>
                      <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>Call Number</p>
                      <p className="text-ink-700 mt-0.5" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>{entry.callNumber}</p>
                    </div>
                    <div>
                      <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>Due Date</p>
                      <p className="text-ink-700 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>{entry.dueDate}</p>
                    </div>
                    {entry.fine !== undefined && (
                      <div>
                        <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>Fine Paid</p>
                        <p className="text-warn font-semibold mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>₱{entry.fine}.00</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
        Click any row to see transaction details.
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "borrowed", label: "Borrowed Books", icon: <Library size={15} /> },
  { key: "saved",    label: "Saved",          icon: <Bookmark size={15} /> },
  { key: "history",  label: "History",        icon: <History size={15} /> },
]

const TAB_SUBTITLES: Record<Tab, string> = {
  borrowed: `${MOCK_BORROWED.length} active loans · Limit: 5 books`,
  saved:    `${MOCK_SAVED.length} books saved`,
  history:  `${MOCK_HISTORY.length} past transactions`,
}

export default function MyLibraryPage() {
  const [tab, setTab] = useState<Tab>("borrowed")
  const [qrBook, setQrBook] = useState<BorrowedBook | null>(null)

  return (
    <>
      <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-6">

        {/* Page header */}
        <div>
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
            {TAB_SUBTITLES[tab]}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-ink-200">
          {TABS.map((t) => {
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors -mb-px whitespace-nowrap",
                  isActive
                    ? "border-green-700 text-green-700 font-semibold"
                    : "border-transparent text-ink-400 hover:text-ink-700 hover:border-ink-200"
                )}
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
              >
                {t.icon}
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {tab === "borrowed" && <BorrowedTab onShowQR={setQrBook} />}
        {tab === "saved"    && <SavedTab />}
        {tab === "history"  && <HistoryTab />}

      </div>

      {/* QR Modal */}
      {qrBook && <QRModal book={qrBook} onClose={() => setQrBook(null)} />}
    </>
  )
}