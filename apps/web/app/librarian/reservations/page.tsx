// apps/web/app/librarian/reservations/page.tsx
"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  BookMarked,
  ChevronDown,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
export type ReservationStatus = "Pending" | "Confirmed" | "Ready" | "Cancelled"

export interface StudentReservation {
  id: string
  student_name: string
  student_id: string
  book_title: string
  book_author: string
  reserved_at: string   // ISO string from DB
  pickup_by: string     // ISO string from DB
  status: ReservationStatus
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
// Replace with: const { data } = await supabase.from("reservations").select(...)

function daysAgo(n: number, h = 9, m = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

const MOCK_RESERVATIONS: StudentReservation[] = [
  {
    id: "RSV-001",
    student_name: "Maria Santos",
    student_id: "2021-00123",
    book_title: "Introduction to Algorithms",
    book_author: "Cormen, Leiserson, Rivest & Stein",
    reserved_at: daysAgo(0, 10, 42),
    pickup_by: daysFromNow(3),
    status: "Pending",
  },
  {
    id: "RSV-002",
    student_name: "Juan dela Cruz",
    student_id: "2022-00456",
    book_title: "Clean Code",
    book_author: "Robert C. Martin",
    reserved_at: daysAgo(0, 8, 15),
    pickup_by: daysFromNow(4),
    status: "Pending",
  },
  {
    id: "RSV-003",
    student_name: "Ana Reyes",
    student_id: "2020-00789",
    book_title: "The Pragmatic Programmer",
    book_author: "David Thomas & Andrew Hunt",
    reserved_at: daysAgo(1, 15, 20),
    pickup_by: daysFromNow(2),
    status: "Confirmed",
  },
  {
    id: "RSV-004",
    student_name: "Carlo Mendoza",
    student_id: "2023-00321",
    book_title: "Design Patterns",
    book_author: "Gang of Four",
    reserved_at: daysAgo(1, 11, 0),
    pickup_by: daysFromNow(5),
    status: "Ready",
  },
  {
    id: "RSV-005",
    student_name: "Sofia Lim",
    student_id: "2021-00654",
    book_title: "You Don't Know JS",
    book_author: "Kyle Simpson",
    reserved_at: daysAgo(2, 9, 30),
    pickup_by: daysFromNow(1),
    status: "Cancelled",
  },
  {
    id: "RSV-006",
    student_name: "Marco Villanueva",
    student_id: "2022-00987",
    book_title: "Designing Data-Intensive Applications",
    book_author: "Martin Kleppmann",
    reserved_at: daysAgo(2, 14, 0),
    pickup_by: daysFromNow(6),
    status: "Pending",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  ReservationStatus,
  { icon: React.ReactNode; iconBg: string; iconColor: string; badge: string }
> = {
  Pending: {
    icon: <Clock size={13} />,
    iconBg: "bg-warn-bg",
    iconColor: "text-warn",
    badge: "bg-warn-bg text-warn",
  },
  Confirmed: {
    icon: <CheckCircle size={13} />,
    iconBg: "bg-info-bg",
    iconColor: "text-info",
    badge: "bg-info-bg text-info",
  },
  Ready: {
    icon: <CheckCircle size={13} />,
    iconBg: "bg-success-bg",
    iconColor: "text-success",
    badge: "bg-success-bg text-success",
  },
  Cancelled: {
    icon: <XCircle size={13} />,
    iconBg: "bg-ink-100",
    iconColor: "text-ink-400",
    badge: "bg-ink-100 text-ink-400",
  },
}

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabKey = "all" | ReservationStatus

type Tab = { key: TabKey; label: string; shortLabel: string }

const TABS: Tab[] = [
  { key: "all",       label: "All",       shortLabel: "All"       },
  { key: "Pending",   label: "Pending",   shortLabel: "Pending"   },
  { key: "Confirmed", label: "Confirmed", shortLabel: "Confirmed" },
  { key: "Ready",     label: "Ready",     shortLabel: "Ready"     },
  { key: "Cancelled", label: "Cancelled", shortLabel: "Cancelled" },
]

// ─── Confirm / Reject Modal ───────────────────────────────────────────────────
interface ActionModalProps {
  reservation: StudentReservation
  action: "confirm" | "reject"
  onConfirm: () => void
  onClose: () => void
}

function ActionModal({ reservation, action, onConfirm, onClose }: ActionModalProps) {
  const isConfirm = action === "confirm"
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-4 bg-white rounded-(--radius) p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "size-11 rounded-full flex items-center justify-center flex-shrink-0",
            isConfirm ? "bg-success-bg" : "bg-danger-bg"
          )}
        >
          {isConfirm
            ? <CheckCircle size={20} className="text-success" />
            : <XCircle size={20} className="text-danger" />
          }
        </div>

        <div className="flex flex-col gap-1">
          <h3
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}
          >
            {isConfirm ? "Confirm Reservation" : "Reject Reservation"}
          </h3>
          <p
            className="text-ink-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {isConfirm
              ? "Confirm this reservation and notify the student it's ready for pickup?"
              : "Reject this reservation? The student will be notified."
            }
          </p>
        </div>

        <div className="flex flex-col gap-1 bg-ink-50 px-3.5 py-3 rounded-(--radius) border-l-[3px] border-green-600">
          <p
            className="text-ink-900 font-semibold leading-snug"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {reservation.book_title}
          </p>
          <p
            className="text-ink-600"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {reservation.student_name} · {reservation.student_id}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) text-white font-medium transition-opacity hover:opacity-90",
              isConfirm ? "bg-green-700" : "bg-danger"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {isConfirm ? "Yes, Confirm" : "Yes, Reject"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ReservationStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0",
        cfg.badge
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
    >
      <span className={cn("flex-shrink-0", cfg.iconColor)}>{cfg.icon}</span>
      {status}
    </span>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow({ isLast }: { isLast: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 sm:px-5 py-4",
        !isLast && "border-b border-ink-100"
      )}
    >
      <div className="mt-0.5 size-7 rounded-full bg-ink-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex justify-between gap-4">
          <div className="h-3.5 w-2/5 rounded bg-ink-100 animate-pulse" />
          <div className="h-3 w-16 rounded-full bg-ink-100 animate-pulse" />
        </div>
        <div className="h-3 w-3/5 rounded bg-ink-100 animate-pulse" />
        <div className="flex gap-4">
          <div className="h-3 w-20 rounded bg-ink-100 animate-pulse" />
          <div className="h-3 w-20 rounded bg-ink-100 animate-pulse" />
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <div className="h-7 w-20 rounded-(--radius) bg-ink-100 animate-pulse" />
        <div className="h-7 w-16 rounded-(--radius) bg-ink-100 animate-pulse" />
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-ink-400 gap-2">
      <BookMarked size={28} className="opacity-30 mb-1" />
      <p style={{ fontSize: "var(--text-body)", fontFamily: "var(--font-body)" }}>
        No reservations found
      </p>
    </div>
  )
}

// ─── Reservation Row ──────────────────────────────────────────────────────────
interface ReservationRowProps {
  reservation: StudentReservation
  isLast: boolean
  onAction: (r: StudentReservation, action: "confirm" | "reject") => void
}

function ReservationRow({ reservation: r, isLast, onAction }: ReservationRowProps) {
  const cfg = STATUS_CONFIG[r.status]
  const isPending = r.status === "Pending"

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 sm:px-5 py-4 transition-colors hover:bg-ink-50",
        !isPending && "opacity-80",
        !isLast && "border-b border-ink-100"
      )}
    >
      {/* Status icon */}
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full size-7",
          cfg.iconBg,
          cfg.iconColor
        )}
      >
        {cfg.icon}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Student name + ID + status badge */}
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="text-ink-900 font-semibold leading-snug"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
          >
            {r.student_name}
          </p>
          <span
            className="text-ink-400"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {r.student_id}
          </span>
          <StatusBadge status={r.status} />
        </div>

        {/* Book title + author — matches notification description color */}
        <p
          className="text-ink-400 leading-relaxed"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {r.book_title}
          <span className="text-ink-300"> · </span>
          {r.book_author}
        </p>

        {/* Dates — matches notification description color */}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
          <span
            className="text-ink-400"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Reserved: <span className="text-ink-400 font-medium">{formatDate(r.reserved_at)}</span>
            <span className="text-ink-300 mx-1">·</span>
            <span className="text-ink-400">{formatTime(r.reserved_at)}</span>
          </span>
          <span
            className="text-ink-400"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Pickup by: <span className="text-ink-400 font-medium">{formatDate(r.pickup_by)}</span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
        {isPending && (
          <>
            <button
              onClick={() => onAction(r, "confirm")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              <CheckCircle size={13} />
              <span className="hidden sm:inline">Confirm</span>
            </button>
            <button
              onClick={() => onAction(r, "reject")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-(--radius) border border-danger/30 bg-white text-danger font-medium hover:bg-danger-bg transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              <XCircle size={13} />
              <span className="hidden sm:inline">Reject</span>
            </button>
          </>
        )}
        {r.status === "Confirmed" && (
          <button
            onClick={() => onAction(r, "confirm")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            <CheckCircle size={13} />
            <span className="hidden sm:inline">Mark Ready</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LibrarianReservationsPage() {
  const [reservations, setReservations] = useState<StudentReservation[]>(MOCK_RESERVATIONS)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "pickup">("newest")

  const [modalTarget, setModalTarget] = useState<{
    reservation: StudentReservation
    action: "confirm" | "reject"
  } | null>(null)

  // ── Tab counts ─────────────────────────────────────────────────────────────
  const tabCounts: Record<TabKey, number> = useMemo(() => ({
    all:       reservations.length,
    Pending:   reservations.filter((r) => r.status === "Pending").length,
    Confirmed: reservations.filter((r) => r.status === "Confirmed").length,
    Ready:     reservations.filter((r) => r.status === "Ready").length,
    Cancelled: reservations.filter((r) => r.status === "Cancelled").length,
  }), [reservations])

  // ── Filter + search + sort ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = activeTab === "all"
      ? reservations
      : reservations.filter((r) => r.status === activeTab)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          r.student_id.toLowerCase().includes(q) ||
          r.book_title.toLowerCase().includes(q) ||
          r.book_author.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.reserved_at).getTime() - new Date(a.reserved_at).getTime()
      if (sortBy === "oldest") return new Date(a.reserved_at).getTime() - new Date(b.reserved_at).getTime()
      return new Date(a.pickup_by).getTime() - new Date(b.pickup_by).getTime()
    })
  }, [reservations, activeTab, search, sortBy])

  function handleAction(reservation: StudentReservation, action: "confirm" | "reject") {
    setModalTarget({ reservation, action })
  }

  function handleActionConfirm() {
    if (!modalTarget) return
    const { reservation, action } = modalTarget
    // TODO: await fetch(`/api/reservations/${reservation.id}`, { method: "PATCH", body: ... })
    setReservations((prev) =>
      prev.map((r) => {
        if (r.id !== reservation.id) return r
        if (action === "confirm") {
          return { ...r, status: r.status === "Confirmed" ? "Ready" : "Confirmed" }
        }
        return { ...r, status: "Cancelled" }
      })
    )
    setModalTarget(null)
  }

  // ── Tab button — mirrors NotificationFeed TabButton exactly ────────────────
  function TabButton({ tab, isMobile }: { tab: Tab; isMobile: boolean }) {
    const isActive = activeTab === tab.key
    const count = tabCounts[tab.key]
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab.key)}
        className={cn(
          "flex items-center gap-1.5 py-2.5 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 px-3",
          isActive
            ? "border-green-700 text-green-700"
            : "border-transparent text-ink-500 hover:text-ink-900"
        )}
        style={{
          fontSize: isMobile ? "var(--text-xs)" : "var(--text-sm-body)",
          fontFamily: "var(--font-body)",
        }}
      >
        {isMobile ? tab.shortLabel : tab.label}
        {count > 0 && (
          <span
            className={cn(
              "flex items-center justify-center rounded-full min-w-4 h-4 px-1 font-semibold flex-shrink-0",
              isActive ? "bg-green-700 text-white" : "bg-ink-200 text-ink-500"
            )}
            style={{ fontSize: "var(--text-2xs)" }}
          >
            {count}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-paper">

      {/* ── Page Header ── */}
      <div className="px-4 sm:px-8 pt-6 pb-4">
        <h1
          className="text-ink-900 font-semibold leading-tight"
          style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}
        >
          Reservation Queue
        </h1>
        <p
          className="text-ink-500 mt-1"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          Review and manage student book reservation requests.
        </p>
      </div>

      {/* ── Tab Filters ── */}
      <div className="border-b border-ink-200">
        <div className="flex sm:hidden w-full overflow-x-auto px-2 scrollbar-none">
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} isMobile={true} />)}
        </div>
        <div className="hidden sm:flex px-8">
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} isMobile={false} />)}
        </div>
      </div>

      {/* ── Search + Sort bar ── */}
      <div className="px-4 sm:px-8 py-3 flex flex-col sm:flex-row gap-2 border-b border-ink-100 bg-white">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name, ID, or book title…"
            className="w-full pl-9 pr-4 py-2 rounded-(--radius) border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-600 transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
        <div className="relative flex-shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="appearance-none pl-3 pr-8 py-2 rounded-(--radius) border border-ink-200 bg-white text-ink-700 focus:outline-none focus:border-green-600 transition-colors cursor-pointer"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="pickup">Pickup date</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-4 sm:px-8 py-4">
        {isLoading ? (
          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} isLast={i === 3} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
            <EmptyState />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p
              className="text-ink-400 px-1 mb-2"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
            >
              {filtered.length} reservation{filtered.length !== 1 ? "s" : ""}
              {search ? ` matching "${search}"` : ""}
            </p>
            <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
              {filtered.map((r, i) => (
                <ReservationRow
                  key={r.id}
                  reservation={r}
                  isLast={i === filtered.length - 1}
                  onAction={handleAction}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Action Modal ── */}
      {modalTarget && (
        <ActionModal
          reservation={modalTarget.reservation}
          action={modalTarget.action}
          onConfirm={handleActionConfirm}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  )
}