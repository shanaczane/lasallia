// apps/web/app/student/reservations/page.tsx
"use client"

import { useState, useEffect } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
type ReservationStatus = "Pending" | "Confirmed" | "Ready" | "Cancelled"

interface Reservation {
  id: string
  bookTitle: string
  author: string
  reservationDate: string
  pickupDate: string
  status: ReservationStatus
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: "RSV-001",
    bookTitle: "Introduction to Algorithms",
    author: "Cormen, Leiserson, Rivest & Stein",
    reservationDate: "2025-06-10",
    pickupDate: "2025-06-14",
    status: "Ready",
  },
  {
    id: "RSV-002",
    bookTitle: "Clean Code: A Handbook of Agile Software Craftsmanship",
    author: "Robert C. Martin",
    reservationDate: "2025-06-12",
    pickupDate: "2025-06-16",
    status: "Confirmed",
  },
  {
    id: "RSV-003",
    bookTitle: "The Pragmatic Programmer",
    author: "David Thomas & Andrew Hunt",
    reservationDate: "2025-06-14",
    pickupDate: "2025-06-18",
    status: "Pending",
  },
  {
    id: "RSV-004",
    bookTitle: "Design Patterns: Elements of Reusable Object-Oriented Software",
    author: "Gang of Four",
    reservationDate: "2025-06-01",
    pickupDate: "2025-06-05",
    status: "Cancelled",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const STATUS_CONFIG: Record<
  ReservationStatus,
  { dot: string; badge: string; label: string }
> = {
  Ready:     { dot: "bg-green-500",  badge: "bg-green-100 text-green-700",  label: "Ready"     },
  Confirmed: { dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-700",    label: "Confirmed" },
  Pending:   { dot: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-700",label: "Pending"   },
  Cancelled: { dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-500",    label: "Cancelled" },
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return isMobile
}

const canCancel = (status: ReservationStatus) =>
  status === "Pending" || status === "Confirmed" || status === "Ready"

// ─── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ReservationStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cfg.badge}`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
type FilterValue = ReservationStatus | "All"
const FILTERS: FilterValue[] = ["All", "Pending", "Confirmed", "Ready", "Cancelled"]

interface FilterTabsProps {
  active: FilterValue
  onChange: (f: FilterValue) => void
  reservations: Reservation[]
}

function FilterTabs({ active, onChange, reservations }: FilterTabsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {FILTERS.map((f) => {
        const count =
          f === "All"
            ? reservations.length
            : reservations.filter((r) => r.status === f).length
        const isActive = active === f
        return (
          <button
            key={f}
            onClick={() => onChange(f)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors
              ${isActive
                ? "bg-green-700 text-white border-transparent"
                : "bg-white text-gray-600 border border-gray-200 hover:border-green-200 hover:text-green-700"
              }`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {f}
            <span
              className={`px-1.5 py-px rounded-full text-[11px] font-bold
                ${isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
      <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 19V6a2 2 0 012-2h5v15H6a2 2 0 01-2-2zM13 4h5a2 2 0 012 2v13a2 2 0 01-2 2h-5V4z"
            fill="#bbf7d0"
            stroke="#16a34a"
            strokeWidth="1.4"
          />
          <path d="M12 4v15" stroke="#16a34a" strokeWidth="1.4" />
        </svg>
      </div>
      <p
        className="text-ink-900 font-semibold"
        style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}
      >
        No reservations yet
      </p>
      <p
        className="text-ink-400 text-center max-w-xs"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
      >
        Browse the catalog and reserve a book. Your reservations will appear here.
      </p>
      <a
        href="/student/catalog"
        className="mt-2 px-5 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition-colors"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Browse Catalog
      </a>
    </div>
  )
}

// ─── Skeleton: Desktop Row ────────────────────────────────────────────────────
function DesktopSkeletonRow() {
  return (
    <tr className="border-b border-gray-100 last:border-none">
      {[48, 28, 28, 20, 20].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className="h-3 rounded-md animate-pulse bg-gray-200"
            style={{ width: `${w * 4}px`, maxWidth: "100%" }}
          />
        </td>
      ))}
    </tr>
  )
}

// ─── Skeleton: Mobile Card ────────────────────────────────────────────────────
function MobileSkeletonCard() {
  return (
    <div className="flex flex-col gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-3.5 w-3/4 rounded-md animate-pulse bg-gray-200" />
          <div className="h-3 w-2/5 rounded-md animate-pulse bg-gray-200" />
        </div>
        <div className="h-5 w-16 rounded-full animate-pulse bg-gray-200 shrink-0" />
      </div>
      <div className="flex gap-6">
        <div className="h-3 w-20 rounded-md animate-pulse bg-gray-200" />
        <div className="h-3 w-20 rounded-md animate-pulse bg-gray-200" />
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-gray-100">
        <div className="h-3 w-14 rounded-md animate-pulse bg-gray-200" />
        <div className="h-8 w-16 rounded-lg animate-pulse bg-gray-200" />
      </div>
    </div>
  )
}

// ─── Mobile Card ──────────────────────────────────────────────────────────────
interface MobileCardProps {
  reservation: Reservation
  onCancel: () => void
}

function MobileCard({ reservation: r, onCancel }: MobileCardProps) {
  return (
    <div className="flex flex-col gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      {/* Title + Badge */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p
            className="text-ink-900 font-semibold leading-snug break-words"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-body)" }}
          >
            {r.bookTitle}
          </p>
          <p
            className="text-ink-400"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {r.author}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {/* Dates */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-ink-400 uppercase tracking-wide font-semibold"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
          >
            Reserved On
          </span>
          <span
            className="text-ink-700 font-medium"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {formatDate(r.reservationDate)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span
            className="text-ink-400 uppercase tracking-wide font-semibold"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
          >
            Pickup Date
          </span>
          <span
            className="text-ink-700 font-medium"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {formatDate(r.pickupDate)}
          </span>
        </div>
      </div>

      {/* ID + Action */}
      <div className="flex justify-between items-center pt-3 border-t border-gray-100">
        <span
          className="text-gray-300 font-mono"
          style={{ fontSize: "var(--text-xs)" }}
        >
          {r.id}
        </span>
        {canCancel(r.status) ? (
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg border border-red-300 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </button>
        ) : (
          <span className="text-gray-300 text-sm">—</span>
        )}
      </div>
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex flex-col gap-3 bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              stroke="#dc2626"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Text */}
        <div>
          <h3
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}
          >
            Cancel Reservation
          </h3>
          <p
            className="text-ink-400 mt-1"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
          >
            Are you sure you want to cancel your reservation for:
          </p>
        </div>

        {/* Book title highlight */}
        <p
          className="text-ink-900 font-semibold bg-gray-50 px-3.5 py-2.5 rounded-lg border-l-[3px] border-green-600 break-words"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
        >
          {reservation.bookTitle}
        </p>

        <p
          className="text-gray-400"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
        >
          This action cannot be undone. The book will be made available to other students.
        </p>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-1">
          <button
            onClick={onClose}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Keep Reservation
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
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
  const [filterStatus, setFilterStatus] = useState<FilterValue>("All")

  const isMobile = useIsMobile()

  const handleCancelConfirm = () => {
    if (!cancelTarget) return
    setReservations((prev) =>
      prev.map((r) =>
        r.id === cancelTarget.id ? { ...r, status: "Cancelled" as ReservationStatus } : r
      )
    )
    setCancelTarget(null)
  }

  const filtered =
    filterStatus === "All"
      ? reservations
      : reservations.filter((r) => r.status === filterStatus)

  const activeCount = reservations.filter((r) => r.status !== "Cancelled").length

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto flex flex-col gap-0">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
          >
            Reservations
          </h1>
          <p
            className="text-ink-400 mt-1"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
          >
            {activeCount > 0
              ? `You have ${activeCount} active reservation${activeCount !== 1 ? "s" : ""}.`
              : "No active reservations."}
          </p>
        </div>

        <button
          onClick={() => {
            setIsLoading(true)
            setTimeout(() => { setReservations(MOCK_RESERVATIONS); setIsLoading(false) }, 1500)
          }}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"
              stroke="#15803d"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Filter Tabs ── */}
      <FilterTabs
        active={filterStatus}
        onChange={setFilterStatus}
        reservations={reservations}
      />

      {/* ── MOBILE: Card List ── */}
      {isMobile && (
        <div className="flex flex-col gap-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <MobileSkeletonCard key={i} />)
            : filtered.length === 0
            ? <div className="bg-white rounded-xl border border-gray-200"><EmptyState /></div>
            : filtered.map((r) => (
                <MobileCard
                  key={r.id}
                  reservation={r}
                  onCancel={() => setCancelTarget(r)}
                />
              ))}
        </div>
      )}

      {/* ── DESKTOP: Table ── */}
      {!isMobile && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Book Title", "Reserved On", "Pickup Date", "Status", "Action"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <DesktopSkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5}><EmptyState /></td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={`hover:bg-green-50 transition-colors ${idx < filtered.length - 1 ? "border-b border-gray-100" : ""}`}
                    >
                      {/* Book Title */}
                      <td className="px-5 py-4 min-w-[220px]">
                        <p
                          className="text-ink-900 font-semibold leading-snug"
                          style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-body)" }}
                        >
                          {r.bookTitle}
                        </p>
                        <p
                          className="text-ink-400 mt-0.5"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                        >
                          {r.author}
                        </p>
                      </td>

                      {/* Reserved On */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className="text-ink-700"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                        >
                          {formatDate(r.reservationDate)}
                        </span>
                      </td>

                      {/* Pickup Date */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className="text-ink-700"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                        >
                          {formatDate(r.pickupDate)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} />
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4">
                        {canCancel(r.status) ? (
                          <button
                            onClick={() => setCancelTarget(r)}
                            className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors whitespace-nowrap"
                            style={{ fontFamily: "var(--font-body)" }}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          {!isLoading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
              <span
                className="text-ink-400"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
              >
                Showing {filtered.length} of {reservations.length} reservation
                {reservations.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Cancel Modal ── */}
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