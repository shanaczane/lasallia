// apps/web/app/student/reservations/page.tsx
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { CheckCircle, Clock, XCircle, BookMarked } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
type ReservationStatus = "Pending" | "Confirmed" | "Ready" | "Cancelled"

interface Reservation {
  id: string
  bookTitle: string
  author: string
  reservationDate: string  // ISO string
  pickupDate: string       // ISO string
  status: ReservationStatus
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
function daysAgo(n: number, hours = 8, minutes = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: "RSV-001",
    bookTitle: "Introduction to Algorithms",
    author: "Cormen, Leiserson, Rivest & Stein",
    reservationDate: daysAgo(0, 10, 42),
    pickupDate: daysFromNow(3),
    status: "Ready",
  },
  {
    id: "RSV-002",
    bookTitle: "Clean Code: A Handbook of Agile Software Craftsmanship",
    author: "Robert C. Martin",
    reservationDate: daysAgo(0, 8, 0),
    pickupDate: daysFromNow(4),
    status: "Confirmed",
  },
  {
    id: "RSV-003",
    bookTitle: "The Pragmatic Programmer",
    author: "David Thomas & Andrew Hunt",
    reservationDate: daysAgo(1, 15, 20),
    pickupDate: daysFromNow(2),
    status: "Pending",
  },
  {
    id: "RSV-004",
    bookTitle: "Design Patterns: Elements of Reusable Object-Oriented Software",
    author: "Gang of Four",
    reservationDate: daysAgo(2, 14, 30),
    pickupDate: daysFromNow(1),
    status: "Cancelled",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPickupDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  })
}

function groupByDate(reservations: Reservation[]): { label: string; items: Reservation[] }[] {
  const groups: Record<string, Reservation[]> = {}

  for (const r of reservations) {
    const date = new Date(r.reservationDate)
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
    .sort((a, b) => {
      const dateA = new Date(a[1][0].reservationDate).getTime()
      const dateB = new Date(b[1][0].reservationDate).getTime()
      return dateB - dateA
    })
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
  Ready: {
    icon: () => <CheckCircle size={15} />,
    iconBg: "bg-success-bg",
    iconColor: "text-success",
    title: "Your reserved book is ready for pickup",
    message: (r) =>
      `"${r.bookTitle}" by ${r.author} is waiting at the Main LRC desk. Pick up by ${formatPickupDate(r.pickupDate)}.`,
  },
  Confirmed: {
    icon: () => <Clock size={15} />,
    iconBg: "bg-info-bg",
    iconColor: "text-info",
    title: "Reservation confirmed",
    message: (r) =>
      `Your reservation for "${r.bookTitle}" has been confirmed. Pick up by ${formatPickupDate(r.pickupDate)}.`,
  },
  Pending: {
    icon: () => <Clock size={15} />,
    iconBg: "bg-warn-bg",
    iconColor: "text-warn",
    title: "Reservation pending",
    message: (r) =>
      `"${r.bookTitle}" by ${r.author} is awaiting confirmation. Expected pickup by ${formatPickupDate(r.pickupDate)}.`,
  },
  Cancelled: {
    icon: () => <XCircle size={15} />,
    iconBg: "bg-ink-100",
    iconColor: "text-ink-400",
    title: "Reservation cancelled",
    message: (r) =>
      `Your reservation for "${r.bookTitle}" has been cancelled.`,
  },
}

const canCancel = (status: ReservationStatus) =>
  status === "Pending" || status === "Confirmed" || status === "Ready"

// ─── Tab config ───────────────────────────────────────────────────────────────
type TabKey = "all" | "Pending" | "Confirmed" | "Ready" | "Cancelled"

type Tab = {
  key: TabKey
  label: string
  shortLabel: string
  status?: ReservationStatus
}

const TABS: Tab[] = [
  { key: "all",       label: "All",       shortLabel: "All"       },
  { key: "Pending",   label: "Pending",   shortLabel: "Pending",   status: "Pending"   },
  { key: "Confirmed", label: "Confirmed", shortLabel: "Confirmed", status: "Confirmed" },
  { key: "Ready",     label: "Ready",     shortLabel: "Ready",     status: "Ready"     },
  { key: "Cancelled", label: "Cancelled", shortLabel: "Cancelled", status: "Cancelled" },
]

// ─── Reservation Item Row ─────────────────────────────────────────────────────
interface ReservationItemCardProps {
  reservation: Reservation
  onCancel: () => void
  isLast: boolean
}

function ReservationItemCard({ reservation: r, onCancel, isLast }: ReservationItemCardProps) {
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

      {/* Right side: cancel button vertically centered */}
      <div className="flex items-center flex-shrink-0">
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
    <div
      className={cn(
        "flex items-start gap-3 px-4 sm:px-5 py-4",
        !isLast && "border-b border-ink-100"
      )}
    >
      <div className="mt-0.5 size-7 rounded-full bg-ink-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="h-3.5 w-3/5 rounded bg-ink-100 animate-pulse" />
        <div className="h-3 w-4/5 rounded bg-ink-100 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-ink-100 animate-pulse" />
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0 pt-0.5">
        <div className="h-3 w-12 rounded bg-ink-100 animate-pulse" />
        <div className="size-2 rounded-full bg-ink-100 animate-pulse" />
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
      <a
        href="/student/catalog"
        className="mt-1 px-4 py-1.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors"
        style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
      >
        Browse Catalog
      </a>
    </div>
  )
}

// ─── Cancel Modal ─────────────────────────────────────────────────────────────
interface CancelModalProps {
  reservation: Reservation
  onConfirm: () => void
  onClose: () => void
}

function CancelModal({ reservation, onConfirm, onClose }: CancelModalProps) {
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
          {reservation.bookTitle}
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
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Keep Reservation
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-(--radius) bg-danger text-white font-medium hover:opacity-90 transition-opacity"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Yes, Cancel It
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>(MOCK_RESERVATIONS)
  const [isLoading, setIsLoading] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>("all")

  const handleCancelConfirm = () => {
    if (!cancelTarget) return
    setReservations((prev) =>
      prev.map((r) =>
        r.id === cancelTarget.id ? { ...r, status: "Cancelled" as ReservationStatus } : r
      )
    )
    setCancelTarget(null)
  }

  const tabCounts: Record<TabKey, number> = {
    all:       reservations.filter((r) => canCancel(r.status)).length,
    Pending:   reservations.filter((r) => r.status === "Pending").length,
    Confirmed: reservations.filter((r) => r.status === "Confirmed").length,
    Ready:     reservations.filter((r) => r.status === "Ready").length,
    Cancelled: reservations.filter((r) => r.status === "Cancelled").length,
  }

  const filtered =
    activeTab === "all"
      ? reservations
      : reservations.filter((r) => r.status === activeTab)

  const groups = groupByDate(filtered)

  function TabButton({ tab, isMobile }: { tab: Tab; isMobile: boolean }) {
    const isActive = activeTab === tab.key
    const count = tabCounts[tab.key]
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab.key)}
        className={cn(
          "flex items-center gap-1.5 py-2.5 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0",
          isMobile ? "px-3" : "px-3",
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
            onClick={() => {
              setIsLoading(true)
              setTimeout(() => { setReservations(MOCK_RESERVATIONS); setIsLoading(false) }, 1500)
            }}
            className="flex-shrink-0 px-3 py-1.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
          >
            Refresh list
          </button>
        </div>
      </div>

      <div className="border-b border-ink-200">
        <div className="flex sm:hidden w-full overflow-x-auto px-2 scrollbar-none">
          {TABS.map((tab) => (
            <TabButton key={tab.key} tab={tab} isMobile={true} />
          ))}
        </div>
        <div className="hidden sm:flex px-8">
          {TABS.map((tab) => (
            <TabButton key={tab.key} tab={tab} isMobile={false} />
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-8 py-4">
        {isLoading ? (
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
                  style={{
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-body)",
                    letterSpacing: "var(--tracking-caps)",
                  }}
                >
                  {label}
                </p>
                <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
                  {items.map((r, i) => (
                    <ReservationItemCard
                      key={r.id}
                      reservation={r}
                      onCancel={() => setCancelTarget(r)}
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
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  )
}