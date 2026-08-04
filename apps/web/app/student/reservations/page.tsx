// apps/web/app/student/reservations/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { CheckCircle, Clock, XCircle, BookMarked, PackageCheck, AlertCircle } from "lucide-react"
import { useReservations } from "@/lib/hooks/useReservations"
import { cancelReservation, pickupReservation } from "@/lib/reservations"
import type { Condition } from "@/lib/kiosk"
import type { Reservation, ReservationStatus } from "@lasallia/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
}

function bookTitle(r: Reservation): string {
  return r.books?.title ?? "Unknown title"
}

function bookAuthor(r: Reservation): string {
  return r.books?.author ?? ""
}

function groupByDate(reservations: Reservation[]): { label: string; items: Reservation[] }[] {
  const groups: Record<string, Reservation[]> = {}

  for (const r of reservations) {
    const date = new Date(r.requested_at)
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    const isToday = date.toDateString() === now.toDateString()
    const isYesterday = date.toDateString() === yesterday.toDateString()

    let label: string
    if (isToday) {
      label = `Today · ${date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}`
    } else if (isYesterday) {
      label = `Yesterday · ${date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}`
    } else {
      label = date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })
    }

    if (!groups[label]) groups[label] = []
    groups[label].push(r)
  }

  return Object.entries(groups)
    .sort((a, b) => new Date(b[1][0].requested_at).getTime() - new Date(a[1][0].requested_at).getTime())
    .map(([label, items]) => ({ label, items }))
}

// ─── Status Config ────────────────────────────────────────────────────────────
type StatusConfig = {
  icon: () => React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  message: (r: Reservation) => string
}

const STATUS_CONFIG: Record<ReservationStatus, StatusConfig> = {
  ready: {
    icon: () => <CheckCircle size={15} />,
    iconBg: "bg-success-bg",
    iconColor: "text-success",
    title: "Ready for pickup",
    message: (r) =>
      `"${bookTitle(r)}" by ${bookAuthor(r)} is waiting for you.${r.pickup_by ? ` Pick up by ${formatDate(r.pickup_by)}.` : ""}`,
  },
  pending: {
    icon: () => <Clock size={15} />,
    iconBg: "bg-warn-bg",
    iconColor: "text-warn",
    title: "In queue",
    message: (r) =>
      `"${bookTitle(r)}" by ${bookAuthor(r)}${r.queue_position ? ` — you're #${r.queue_position} in line` : ""}. We'll hold a copy the moment it's your turn.`,
  },
  fulfilled: {
    icon: () => <PackageCheck size={15} />,
    iconBg: "bg-ink-100",
    iconColor: "text-ink-500",
    title: "Picked up",
    message: (r) => `You picked up "${bookTitle(r)}" — it's now in My Library.`,
  },
  expired: {
    icon: () => <AlertCircle size={15} />,
    iconBg: "bg-ink-100",
    iconColor: "text-ink-400",
    title: "Pickup window passed",
    message: (r) => `Your reservation for "${bookTitle(r)}" expired before pickup.`,
  },
  cancelled: {
    icon: () => <XCircle size={15} />,
    iconBg: "bg-ink-100",
    iconColor: "text-ink-400",
    title: "Reservation cancelled",
    message: (r) => `Your reservation for "${bookTitle(r)}" has been cancelled.`,
  },
}

const canCancel = (status: ReservationStatus) => status === "pending" || status === "ready"

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabKey = "all" | ReservationStatus

type Tab = { key: TabKey; label: string; shortLabel: string }

const TABS: Tab[] = [
  { key: "all",       label: "All",       shortLabel: "All"     },
  { key: "pending",   label: "Pending",   shortLabel: "Pending" },
  { key: "ready",     label: "Ready",     shortLabel: "Ready"   },
  { key: "fulfilled", label: "Picked Up", shortLabel: "Picked Up" },
  { key: "expired",   label: "Expired",   shortLabel: "Expired" },
  { key: "cancelled", label: "Cancelled", shortLabel: "Cancelled" },
]

// ─── Reservation Item Row ─────────────────────────────────────────────────────
interface ReservationItemCardProps {
  reservation: Reservation
  onCancel: () => void
  onPickup: () => void
  isLast: boolean
}

function ReservationItemCard({ reservation: r, onCancel, onPickup, isLast }: ReservationItemCardProps) {
  const config = STATUS_CONFIG[r.status]
  const isActive = canCancel(r.status)

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 sm:px-5 py-4 transition-colors",
        isActive && "hover:bg-green-50/60",
        !isActive && "hover:bg-ink-50",
        !isLast && "border-b border-ink-100"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 flex items-center justify-center rounded-full size-7",
          config.iconBg,
          config.iconColor
        )}
      >
        {config.icon()}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "leading-snug",
            isActive ? "text-ink-900 font-semibold" : "text-ink-500 font-normal"
          )}
          style={{ fontSize: "var(--text-body)", fontFamily: "var(--font-body)" }}
        >
          {config.title}
        </p>
        <p
          className="text-ink-400 mt-0.5 leading-relaxed"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {config.message(r)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {r.status === "ready" && (
          <button
            onClick={onPickup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-(--radius) border border-green-700 bg-green-700 text-white font-medium hover:bg-green-800 transition-colors whitespace-nowrap"
            style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
          >
            <PackageCheck size={13} />
            <span className="hidden sm:inline">Pick up</span>
          </button>
        )}
        {canCancel(r.status) && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-(--radius) border border-danger/30 bg-white text-danger font-medium hover:bg-danger-bg transition-colors whitespace-nowrap"
            style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
          >
            <XCircle size={13} />
            <span className="hidden sm:inline">Cancel</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow({ isLast }: { isLast: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 px-4 sm:px-5 py-4", !isLast && "border-b border-ink-100")}>
      <div className="mt-0.5 size-7 rounded-full bg-ink-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="h-3.5 w-3/5 rounded bg-ink-100 animate-pulse" />
        <div className="h-3 w-4/5 rounded bg-ink-100 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-ink-100 animate-pulse" />
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
        No reservations here
      </p>
      <Link
        href="/student/catalog"
        className="mt-1 px-4 py-1.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors"
        style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
      >
        Browse Catalog
      </Link>
    </div>
  )
}

// ─── Pickup Modal ─────────────────────────────────────────────────────────────
// Fulfillment (plan 5.3): same possession check as a normal borrow — the
// accession number is never shown, the student types it themselves.
const CONDITION_OPTIONS: Array<{ value: Condition; label: string }> = [
  { value: "good", label: "Good" },
  { value: "minor_wear", label: "Minor wear" },
  { value: "already_damaged", label: "Already damaged" },
]

interface PickupModalProps {
  reservation: Reservation
  onConfirmed: (dueDate: string) => void
  onClose: () => void
}

function PickupModal({ reservation, onConfirmed, onClose }: PickupModalProps) {
  const [accessionNumber, setAccessionNumber] = useState("")
  const [condition, setCondition] = useState<Condition>("good")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function handleConfirm() {
    if (!accessionNumber.trim()) return
    setSubmitting(true)
    setError("")
    try {
      const loan = await pickupReservation(reservation.id, {
        accessionNumber,
        condition,
        notes: notes || undefined,
      })
      onConfirmed(loan.due_date)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm this pickup")
      setAccessionNumber("")
    } finally {
      setSubmitting(false)
    }
  }

  const canConfirm = accessionNumber.trim().length > 0 && (condition === "good" || notes.trim().length > 0) && !submitting

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-4 bg-white rounded-(--radius) p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="size-11 rounded-full bg-success-bg flex items-center justify-center flex-shrink-0">
          <PackageCheck size={20} className="text-success" />
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
            Confirm Pickup
          </h3>
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Type the number on the book&apos;s label to confirm it&apos;s the right copy.
          </p>
        </div>

        <p
          className="text-ink-900 font-semibold bg-ink-50 px-3.5 py-2.5 rounded-(--radius) border-l-[3px] border-green-600 break-words"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {bookTitle(reservation)}
        </p>

        <div>
          <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
            Accession number
          </label>
          <input
            type="text"
            value={accessionNumber}
            onChange={(e) => setAccessionNumber(e.target.value)}
            placeholder="e.g. T45136"
            autoFocus
            className="w-full h-11 px-3 rounded-(--radius) border-2 border-ink-200 bg-white text-ink-900 outline-none focus-visible:border-green-700 transition-colors"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-base)" }}
          />
        </div>

        <div>
          <label className="block text-ink-700 mb-1.5 font-medium" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
            Book condition
          </label>
          <div className="flex gap-1.5">
            {CONDITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCondition(opt.value)}
                className={cn(
                  "flex-1 py-2 rounded border font-medium transition-colors",
                  condition === opt.value ? "bg-green-50 border-green-700 text-green-800" : "bg-white border-ink-200 text-ink-600"
                )}
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {condition !== "good" && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the condition…"
              rows={2}
              className="w-full mt-2 px-3 py-2 rounded-(--radius) border border-ink-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            />
          )}
        </div>

        {error && (
          <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {submitting ? "Confirming…" : "Confirm Pickup"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Modal ─────────────────────────────────────────────────────────────
interface CancelModalProps {
  reservation: Reservation
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

function CancelModal({ reservation, pending, onConfirm, onClose }: CancelModalProps) {
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
          <h3
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}
          >
            Cancel Reservation
          </h3>
          <p
            className="text-ink-400"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Are you sure you want to cancel your reservation for:
          </p>
        </div>

        <p
          className="text-ink-900 font-semibold bg-ink-50 px-3.5 py-2.5 rounded-(--radius) border-l-[3px] border-green-600 break-words"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {bookTitle(reservation)}
        </p>

        <p
          className="text-ink-400"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
        >
          This action cannot be undone. The book will be made available to other students.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Keep Reservation
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) bg-danger text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {pending ? "Cancelling…" : "Yes, Cancel It"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReservationsPage() {
  const { reservations, loading, error, refresh } = useReservations()
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [pickupTarget, setPickupTarget] = useState<Reservation | null>(null)
  const [pickedUp, setPickedUp] = useState<{ title: string; dueDate: string } | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>("all")

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelReservation(cancelTarget.id)
      await refresh()
      setCancelTarget(null)
    } catch {
      // error surfaces via the page-level error state on next refresh; keep modal open
    } finally {
      setCancelling(false)
    }
  }

  async function handlePickupConfirmed(dueDate: string) {
    const title = pickupTarget ? bookTitle(pickupTarget) : "This book"
    setPickupTarget(null)
    setPickedUp({ title, dueDate })
    await refresh()
  }

  const tabCounts: Record<TabKey, number> = {
    all:       reservations.filter((r) => canCancel(r.status)).length,
    pending:   reservations.filter((r) => r.status === "pending").length,
    ready:     reservations.filter((r) => r.status === "ready").length,
    fulfilled: reservations.filter((r) => r.status === "fulfilled").length,
    expired:   reservations.filter((r) => r.status === "expired").length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length,
  }

  const filtered =
    activeTab === "all" ? reservations : reservations.filter((r) => r.status === activeTab)

  const groups = groupByDate(filtered)

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

      <div className="px-4 sm:px-8 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1
              className="text-ink-900 font-semibold leading-tight"
              style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}
            >
              Reservations
            </h1>
            <p
              className="text-ink-500 mt-1"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              Track your reserved books, pickup dates, and statuses.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refresh()}
            className="flex-shrink-0 px-3 py-1.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
          >
            Refresh list
          </button>
        </div>
      </div>

      <div className="border-b border-ink-200">
        <div className="flex sm:hidden w-full overflow-x-auto px-2 scrollbar-none">
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} isMobile={true} />)}
        </div>
        <div className="hidden sm:flex px-8">
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} isMobile={false} />)}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-8 py-4">
        {error ? (
          <p className="text-center py-12 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {error}
          </p>
        ) : loading ? (
          <div className="flex flex-col gap-4">
            {[2, 1].map((count, gi) => (
              <div key={gi} className="flex flex-col gap-2">
                <div className="h-3 w-32 rounded bg-ink-100 animate-pulse px-1" />
                <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
                  {Array.from({ length: count }).map((_, i) => (
                    <SkeletonRow key={i} isLast={i === count - 1} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
            <EmptyState />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(({ label, items }) => (
              <div key={label} className="flex flex-col gap-2">
                <p
                  className="text-ink-400 uppercase font-semibold px-1"
                  style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", letterSpacing: "var(--tracking-caps)" }}
                >
                  {label}
                </p>
                <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
                  {items.map((r, i) => (
                    <ReservationItemCard
                      key={r.id}
                      reservation={r}
                      onCancel={() => setCancelTarget(r)}
                      onPickup={() => setPickupTarget(r)}
                      isLast={i === items.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cancelTarget && (
        <CancelModal
          reservation={cancelTarget}
          pending={cancelling}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {pickupTarget && (
        <PickupModal
          reservation={pickupTarget}
          onConfirmed={handlePickupConfirmed}
          onClose={() => setPickupTarget(null)}
        />
      )}

      {pickedUp && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPickedUp(null)}
        >
          <div
            className="flex flex-col items-center gap-3 bg-white rounded-(--radius) p-6 w-full max-w-sm shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="size-12 rounded-full bg-success-bg flex items-center justify-center">
              <CheckCircle size={26} className="text-success" />
            </div>
            <div>
              <p className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
                You&apos;ve borrowed this book
              </p>
              <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                {pickedUp.title}
              </p>
              <p className="text-green-700 font-semibold mt-2" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                Due back {formatDate(pickedUp.dueDate)}
              </p>
            </div>
            <button
              onClick={() => setPickedUp(null)}
              className="mt-1 px-4 py-2 rounded-(--radius) border border-ink-200 text-ink-600 font-medium hover:bg-ink-50 transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
