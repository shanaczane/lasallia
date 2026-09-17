// apps/web/app/librarian/reservations/page.tsx
"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  XCircle,
  Clock,
  PackageCheck,
  AlertCircle,
  Search,
  BookMarked,
  ChevronDown,
} from "lucide-react"
import { useReservations } from "@/lib/hooks/useReservations"
import { cancelReservation } from "@/lib/reservations"
import type { Reservation, ReservationStatus } from "@lasallia/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })
}

function patronName(r: Reservation): string {
  return r.profiles?.full_name ?? "Unknown patron"
}

function patronEmail(r: Reservation): string {
  return r.profiles?.email ?? ""
}

function bookTitle(r: Reservation): string {
  return r.books?.title ?? "Unknown title"
}

function bookAuthor(r: Reservation): string {
  return r.books?.author ?? ""
}

// Ready reservations sit on the hold shelf for a fixed pickup window
// (reservation_hold_period_days, Library Settings — 3 days by default)
// before the sweep in reservations.py automatically expires them and
// hands the copy to the next person in line. Surfaced as a badge right
// next to the patron's name so a librarian can scan the whole list and
// immediately see what's about to lapse, not just read it row by row.
function pickupUrgency(pickupBy: string): { shortLabel: string; badgeClass: string } {
  const diffDays = Math.ceil((new Date(pickupBy).getTime() - Date.now()) / 86_400_000)
  if (diffDays <= 0) return { shortLabel: "Closes today", badgeClass: "bg-danger-bg text-danger" }
  if (diffDays === 1) return { shortLabel: "1 day left", badgeClass: "bg-danger-bg text-danger" }
  if (diffDays <= 2) return { shortLabel: `${diffDays} days left`, badgeClass: "bg-warn-bg text-warn" }
  return { shortLabel: `${diffDays} days left`, badgeClass: "bg-ink-100 text-ink-500" }
}

// ─── Status config ────────────────────────────────────────────────────────────
// Becoming 'ready' is automatic now (Phase 4's return handler, or the
// pickup-window expiry sweep in the API) — nothing here manually advances
// a reservation, only cancels one.
const STATUS_CONFIG: Record<
  ReservationStatus,
  { icon: React.ReactNode; iconBg: string; iconColor: string; badge: string; label: string }
> = {
  pending:   { icon: <Clock size={13} />,        iconBg: "bg-warn-bg",    iconColor: "text-warn",    badge: "bg-warn-bg text-warn",       label: "Pending"   },
  ready:     { icon: <CheckCircle size={13} />,  iconBg: "bg-success-bg", iconColor: "text-success", badge: "bg-success-bg text-success", label: "Ready"     },
  fulfilled: { icon: <PackageCheck size={13} />, iconBg: "bg-ink-100",    iconColor: "text-ink-500", badge: "bg-ink-100 text-ink-500",    label: "Picked Up" },
  expired:   { icon: <AlertCircle size={13} />,  iconBg: "bg-ink-100",    iconColor: "text-ink-400", badge: "bg-ink-100 text-ink-400",    label: "Expired"   },
  cancelled: { icon: <XCircle size={13} />,      iconBg: "bg-ink-100",    iconColor: "text-ink-400", badge: "bg-ink-100 text-ink-400",    label: "Cancelled" },
}

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabKey = "all" | ReservationStatus

// showCount: only the tabs a librarian actually needs to act on carry a
// count badge — pending requests and ready holds are "unread/ongoing"
// work. All, picked up, expired, and cancelled are either a plain total or
// closed history; a count there is just noise, not something to act on.
type Tab = { key: TabKey; label: string; shortLabel: string; showCount: boolean }

const TABS: Tab[] = [
  { key: "all",       label: "All",       shortLabel: "All",       showCount: false },
  { key: "pending",   label: "Pending",   shortLabel: "Pending",   showCount: true  },
  { key: "ready",     label: "Ready",     shortLabel: "Ready",     showCount: true  },
  { key: "fulfilled", label: "Picked Up", shortLabel: "Picked Up", showCount: false },
  { key: "expired",   label: "Expired",   shortLabel: "Expired",   showCount: false },
  { key: "cancelled", label: "Cancelled", shortLabel: "Cancelled", showCount: false },
]

// ─── Reject Modal ──────────────────────────────────────────────────────────────
interface RejectModalProps {
  reservation: Reservation
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

function RejectModal({ reservation, pending, onConfirm, onClose }: RejectModalProps) {
  // A "ready" reservation already has a copy pulled and sitting on the
  // hold shelf — cancelling it releases that specific copy (to the next
  // person in line, or back toward reshelving), not just a queue spot.
  const isReady = reservation.status === "ready"

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-4 bg-white rounded-(--radius) p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="size-11 rounded-full bg-danger-bg flex items-center justify-center flex-shrink-0">
          <XCircle size={20} className="text-danger" />
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
            {isReady ? "Cancel Hold" : "Reject Reservation"}
          </h3>
          <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {isReady
              ? "This copy is on the hold shelf for this student — cancelling releases it to the next person in line, or back to reshelving."
              : "Cancel this student's spot in the queue for this title?"}
          </p>
        </div>

        <div className="flex flex-col gap-1 bg-ink-50 px-3.5 py-3 rounded-(--radius) border-l-[3px] border-green-600">
          <p className="text-ink-900 font-semibold leading-snug" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {bookTitle(reservation)}
          </p>
          <p className="text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            {patronName(reservation)} · {patronEmail(reservation)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Keep It
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) bg-danger text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {pending ? "Working…" : isReady ? "Yes, Cancel Hold" : "Yes, Reject"}
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
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0", cfg.badge)}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
    >
      <span className={cn("flex-shrink-0", cfg.iconColor)}>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow({ isLast }: { isLast: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 px-4 sm:px-5 py-4", !isLast && "border-b border-ink-100")}>
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
  reservation: Reservation
  isLast: boolean
  onReject: (r: Reservation) => void
}

function ReservationRow({ reservation: r, isLast, onReject }: ReservationRowProps) {
  const cfg = STATUS_CONFIG[r.status]
  const isPending = r.status === "pending"
  const isReady = r.status === "ready"
  const canCancel = isPending || isReady

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 sm:px-5 py-4 transition-colors hover:bg-ink-50",
        r.status !== "pending" && r.status !== "ready" && "opacity-80",
        !isLast && "border-b border-ink-100"
      )}
    >
      <div className={cn("flex-shrink-0 flex items-center justify-center rounded-full size-7", cfg.iconBg, cfg.iconColor)}>
        {cfg.icon}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ink-900 font-semibold leading-snug" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
            {patronName(r)}
          </p>
          <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            {patronEmail(r)}
          </span>
          <StatusBadge status={r.status} />
          {isReady && r.pickup_by && (
            <span
              className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap", pickupUrgency(r.pickup_by).badgeClass)}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              <Clock size={10} />
              {pickupUrgency(r.pickup_by).shortLabel}
            </span>
          )}
        </div>

        <p className="text-ink-400 leading-relaxed" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          {bookTitle(r)}
          <span className="text-ink-300"> · </span>
          {bookAuthor(r)}
        </p>

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
          <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            Reserved: <span className="text-ink-400 font-medium">{formatDate(r.requested_at)}</span>
            <span className="text-ink-300 mx-1">·</span>
            <span className="text-ink-400">{formatTime(r.requested_at)}</span>
          </span>
          {isReady && r.pickup_by && (
            <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              On hold shelf — pickup by <span className="font-medium">{formatDate(r.pickup_by)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {canCancel ? (
          <button
            onClick={() => onReject(r)}
            className="flex items-center justify-center gap-1.5 h-8 w-8 sm:w-auto sm:min-w-30 sm:px-3 rounded-(--radius) border border-danger/30 bg-white text-danger font-medium hover:bg-danger-bg transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            <XCircle size={13} />
            <span className="hidden sm:inline">{isReady ? "Cancel Hold" : "Reject"}</span>
          </button>
        ) : (
          // Reserve the same footprint as the action button on rows where
          // there's nothing to cancel, so the right edge of the list stays
          // aligned instead of going ragged.
          <div aria-hidden="true" className="invisible h-8 w-8 sm:w-auto sm:min-w-30 sm:px-3" />
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LibrarianReservationsPage() {
  const { reservations, loading, error, refresh } = useReservations()
  const [actionPending, setActionPending] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>("pending")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "pickup">("newest")

  const [rejectTarget, setRejectTarget] = useState<Reservation | null>(null)

  const tabCounts: Record<TabKey, number> = useMemo(() => ({
    all:       reservations.length,
    pending:   reservations.filter((r) => r.status === "pending").length,
    ready:     reservations.filter((r) => r.status === "ready").length,
    fulfilled: reservations.filter((r) => r.status === "fulfilled").length,
    expired:   reservations.filter((r) => r.status === "expired").length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length,
  }), [reservations])

  const filtered = useMemo(() => {
    let result = activeTab === "all" ? reservations : reservations.filter((r) => r.status === activeTab)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          patronName(r).toLowerCase().includes(q) ||
          patronEmail(r).toLowerCase().includes(q) ||
          bookTitle(r).toLowerCase().includes(q) ||
          bookAuthor(r).toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
      if (sortBy === "oldest") return new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime()
      // pickup: reservations without a pickup date yet sort last
      if (!a.pickup_by) return 1
      if (!b.pickup_by) return -1
      return new Date(a.pickup_by).getTime() - new Date(b.pickup_by).getTime()
    })
  }, [reservations, activeTab, search, sortBy])

  async function handleRejectConfirm() {
    if (!rejectTarget) return
    setActionPending(true)
    try {
      await cancelReservation(rejectTarget.id)
      await refresh()
      setRejectTarget(null)
    } catch {
      // keep the modal open so the librarian can retry
    } finally {
      setActionPending(false)
    }
  }

  function TabButton({ tab, isMobile }: { tab: Tab; isMobile: boolean }) {
    const isActive = activeTab === tab.key
    const count = tabCounts[tab.key]
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab.key)}
        className={cn(
          "flex items-center gap-1.5 py-2.5 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 px-3",
          isActive ? "border-green-700 text-green-700" : "border-transparent text-ink-500 hover:text-ink-900"
        )}
        style={{ fontSize: isMobile ? "var(--text-xs)" : "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
      >
        {isMobile ? tab.shortLabel : tab.label}
        {tab.showCount && count > 0 && (
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
    <div className="w-full max-w-4xl mx-auto flex flex-col flex-1">

      <div className="px-4 sm:px-8 pt-6 pb-4">
        <h1 className="text-ink-900 font-semibold leading-tight" style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}>
          Reservation Queue
        </h1>
        <p className="text-ink-500 mt-1" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
          Fulfillment is automatic — a copy is assigned the moment it&apos;s returned. Rejecting a pending request
          removes a student&apos;s spot in the queue; cancelling a ready hold frees that copy for the next person in line.
        </p>
      </div>

      <div className="border-b border-ink-200">
        <div className="flex sm:hidden w-full overflow-x-auto px-2 scrollbar-none">
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} isMobile={true} />)}
        </div>
        <div className="hidden sm:flex px-8">
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} isMobile={false} />)}
        </div>
      </div>

      <div className="px-4 sm:px-8 py-3 flex flex-col sm:flex-row gap-2 border-b border-ink-100 bg-white">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name, email, or book title…"
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
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-8 py-4">
        {error ? (
          <p className="text-center py-12 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {error}
          </p>
        ) : loading ? (
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
            {search && (
              <p className="text-ink-400 px-1 mb-2" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                Matching &ldquo;{search}&rdquo;
              </p>
            )}
            <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
              {filtered.map((r, i) => (
                <ReservationRow key={r.id} reservation={r} isLast={i === filtered.length - 1} onReject={setRejectTarget} />
              ))}
            </div>
          </div>
        )}
      </div>

      {rejectTarget && (
        <RejectModal
          reservation={rejectTarget}
          pending={actionPending}
          onConfirm={handleRejectConfirm}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </div>
    </div>
  )
}
