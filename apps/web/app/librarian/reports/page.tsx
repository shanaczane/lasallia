// Sprint 5.6 – Reports Screen
// Reports plan Phase 1 — real filterable backend replacing the old
// client-side derive* functions (moved to apps/api/core/reports.py).
// Layout pass: Overview is now a fixed grid of report-preview cards
// (each linking to its own full-report tab) instead of a draggable
// dashboard, and every full-report tab shares one table chrome
// (ReportTableCard) — title/subtitle, search, Export CSV, and a
// footer summary + pagination — so the tabs read as one system.
"use client"

import { Fragment, Suspense, cloneElement, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BarChart2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  Users,
  BookMarked,
  Download,
  Sparkles,
  Search,
  Printer,
  GripVertical,
  ArrowUpDown,
  Paperclip,
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { fetchBooks } from "@/lib/books"
import { fetchPatrons, updatePatronStatus } from "@/lib/users"
import { fetchLoans, type Loan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import { buildFeed, TX_CONFIG, type FeedItem } from "@/lib/activity"
import { fetchBookRequests, updateBookRequest, type BookRequest, type BookRequestStatus } from "@/lib/bookRequests"
import { Pagination } from "@/components/ui/catalog"
import { PatronProfileModal } from "@/components/ui/patrons/PatronProfileModal"
import { ConfirmStatusDialog } from "@/components/ui/patrons/ConfirmStatusDialog"
import { ActivityDetailPanel } from "@/components/dashboard/ActivityDetailPanel"
import {
  fetchCatalogueReport,
  fetchCirculationSummary,
  fetchTransactionTrend,
  fetchTopPatrons,
  fetchOverdueReport,
  fetchFinesReport,
  fetchLibraryStats,
  fetchShelfList,
  fetchReportSummaries,
  resolveDateRange,
  downloadCsv,
  type Bucket,
  type CatalogueSlice,
  type TopPatron,
  type OverdueRow,
  type FineRow,
  type LibraryStats,
  type ProgramUsage,
  type TransactionTrendPoint,
  type ShelfListRow,
  type ReportSummaries,
  type DateRangePreset,
  type ReportFilters,
} from "@/lib/reports"
import {
  fetchWeedingCandidates,
  fetchWeedingEvents,
  archiveBook,
  restoreBook,
  dismissWeedingCandidate,
  type WeedingCandidate,
  type WeedingEvent,
} from "@/lib/weeding"
import type { Book, UserProfile, Reservation } from "@lasallia/types"
import { programLabel } from "@/lib/programLabels"

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportTab = "overview" | "catalogue" | "shelf-list" | "circulation" | "overdue" | "requests" | "weeding" | "activity"
type SortDir = "asc" | "desc" | null
type SortKey = "patron" | "book" | "due" | "days" | "program" | null
type ShelfSortKey = "call_number" | "title" | "accession_number" | null

const YEAR_LEVEL_LABELS: Record<string, number> = {
  "1st Year": 1,
  "2nd Year": 2,
  "3rd Year": 3,
  "4th Year": 4,
}

const REPORT_PAGE_SIZE = 8

// ─── Small shared pieces ───────────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded border border-ink-200 bg-white py-10 flex items-center justify-center text-ink-400"
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
    >
      {text}
    </div>
  )
}

// ─── Uniform chrome for every full-report tab: title/subtitle, search,
// Export CSV, then whatever table the caller renders, then a footer
// summary + pagination. Keeping this one component is what makes
// Catalogue/Shelf List/Circulation/Patrons/Requests read as one system.
function ReportTableCard({
  title,
  subtitle,
  query,
  onQueryChange,
  searchPlaceholder = "Search this report…",
  onExport,
  exportDisabled,
  children,
  footerLeft,
  page,
  totalPages,
  onPageChange,
}: {
  title: string
  subtitle: string
  query?: string
  onQueryChange?: (v: string) => void
  searchPlaceholder?: string
  onExport: () => void
  exportDisabled: boolean
  children: React.ReactNode
  footerLeft: string
  page?: number
  totalPages?: number
  onPageChange?: (p: number) => void
}) {
  return (
    <div className="rounded border border-ink-200 bg-white p-5 flex flex-col gap-4" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
            {title}
          </h2>
          <p className="text-ink-400 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onQueryChange && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <input
                type="text"
                value={query ?? ""}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-7 pr-3 py-1.5 rounded border border-ink-300 bg-white text-ink-800 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 w-44 sm:w-56"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
          )}
          <button
            onClick={onExport}
            disabled={exportDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-ink-300 text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {children}

      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          {footerLeft}
        </p>
        {totalPages != null && page != null ? (
          totalPages > 1 && onPageChange ? (
            <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
          ) : (
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              Page {page} of {totalPages}
            </p>
          )
        ) : null}
      </div>
    </div>
  )
}

// ─── Overview preview card — title/subtitle left, an "Open full report"
// link OR a plain corner note on the right, never both. ─────────────────────
function OverviewCard({
  title,
  subtitle,
  action,
  corner,
  dragHandle,
  children,
}: {
  title: string
  subtitle: string
  action?: { label: string; onClick: () => void }
  corner?: string
  dragHandle?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded border border-ink-200 bg-white p-5 flex flex-col gap-3 h-full" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
            {title}
          </h3>
          <p className="text-ink-400 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {action ? (
            <button
              onClick={action.onClick}
              className="text-green-700 hover:text-green-900 font-medium shrink-0 whitespace-nowrap transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {action.label}
            </button>
          ) : corner ? (
            <span className="text-ink-400 shrink-0 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {corner}
            </span>
          ) : null}
          {dragHandle}
        </div>
      </div>
      {children}
    </div>
  )
}

// ─── Drag-to-reorder wrapper for the Overview grid — Sprint 5.6.1, kept
// through the layout pass. Renders whatever OverviewCard the caller gives
// it, plus a grip handle wired to dnd-kit. ─────────────────────────────────
function SortableOverviewCard({ id, full, children }: { id: string; full?: boolean; children: (dragHandle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="p-1 rounded cursor-grab active:cursor-grabbing text-ink-300 hover:text-ink-600 hover:bg-ink-100 transition-colors touch-none"
      aria-label="Drag to reorder"
    >
      <GripVertical size={14} />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={cn("h-full transition-shadow rounded", full && "lg:col-span-2", isDragging && "opacity-90 ring-2 ring-green-400")}
    >
      {children(handle)}
    </div>
  )
}

// ─── Inline chart components — data-driven via props ──────────────────────────
function CatalogueBarList({ data }: { data: CatalogueSlice[] }) {
  if (data.length === 0) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No books in the catalog yet.</p>
  }
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
          <span className="text-ink-700 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {d.label}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden min-w-6">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </div>
          <span className="text-ink-400 w-6 text-right shrink-0" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
            {d.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// Circulation Overview bar chart — a single-series magnitude-by-month view.
// Bar width/gap are fixed and the viewBox scales with data.length (rather
// than a fixed 270px canvas sized for exactly 6 bars) so it doesn't crowd
// or overflow if the range returns a different bucket count. Rounded-top/
// square-baseline bars, a hairline baseline, and a per-bar hover tooltip
// (value + share of the period total — context the always-on tip label
// doesn't carry) replace the old static, unlabeled-baseline version.
function BarChartViz({ data }: { data: Bucket[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
        No circulation data in this range yet.
      </p>
    )
  }

  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((s, d) => s + d.value, 0)
  const bw = 20
  const gap = 38
  const chartH = 64
  const padTop = 20
  const padBottom = 20
  const radius = 4
  const W = data.length * gap
  const H = padTop + chartH + padBottom
  const baseline = padTop + chartH

  const bars = data.map((d, i) => {
    const x = i * gap + (gap - bw) / 2
    const h = Math.max(1.5, (d.value / max) * chartH)
    const y = baseline - h
    const r = Math.min(radius, h, bw / 2)
    // Rounded top corners, square at the baseline — a plain rx rounds all
    // four corners, which reads as "floating" rather than grown-from-axis.
    const path = `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${y + h} Z`
    return { ...d, x, y, h, path }
  })

  const active = hovered != null ? bars[hovered] : null

  return (
    <div className="flex flex-col gap-1.5 w-full relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Books borrowed by month">
        <line x1={0} y1={baseline} x2={W} y2={baseline} stroke="#DDDFD7" strokeWidth={1} />
        {bars.map((b, i) => {
          const isActive = hovered === i
          return (
            <g
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((v) => (v === i ? null : v))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((v) => (v === i ? null : v))}
              tabIndex={0}
              className="outline-none cursor-pointer"
            >
              {/* Hit target spans the whole slot, not just the painted bar. */}
              <rect x={i * gap} y={padTop} width={gap} height={chartH} fill="transparent" />
              <path d={b.path} fill="#00874A" opacity={isActive ? 1 : 0.82} className="transition-opacity" />
              <text x={b.x + bw / 2} y={baseline + 14} textAnchor="middle" fontSize={8.5} fill="#6B6E63" fontFamily="var(--font-body)">
                {b.label}
              </text>
              <text x={b.x + bw / 2} y={b.y - 5} textAnchor="middle" fontSize={8} fontWeight={isActive ? 700 : 600} fill="#14150F" fontFamily="var(--font-body)">
                {b.value}
              </text>
            </g>
          )
        })}
      </svg>
      {active && (
        <div
          className="absolute -translate-x-1/2 -translate-y-[calc(100%+6px)] pointer-events-none rounded bg-ink-900 px-2 py-1 shadow-(--shadow-sm) whitespace-nowrap z-10"
          style={{ left: `${((active.x + bw / 2) / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
        >
          <p className="text-white font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {active.value} {active.value === 1 ? "loan" : "loans"}
          </p>
          <p className="text-ink-300" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {total > 0 ? Math.round((active.value / total) * 100) : 0}% of total
          </p>
        </div>
      )}
    </div>
  )
}

function TransactionTrendChart({ data }: { data: TransactionTrendPoint[] }) {
  if (data.length === 0) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No activity in this range yet.</p>
  }
  const max = Math.max(1, ...data.map((d) => Math.max(d.borrows, d.returns)))
  const W = 280, H = 100, padX = 12, padY = 14
  const pts = (key: "borrows" | "returns") =>
    data.map((d, i) => ({
      x: padX + (i / (data.length - 1)) * (W - padX * 2),
      y: padY + ((max - d[key]) / max) * (H - padY * 2),
    }))
  const toPath = (p: { x: number; y: number }[]) => p.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x},${pt.y}`).join(" ")
  const borrowPts = pts("borrows")
  const returnPts = pts("returns")

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: "#00874A" }} /> Borrows
        </span>
        <span className="flex items-center gap-1.5 text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          <span className="w-3 h-0.5 inline-block" style={{ borderTop: "1.5px dashed #B8923D" }} /> Returns
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <path d={toPath(returnPts)} fill="none" stroke="#B8923D" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
        <path d={toPath(borrowPts)} fill="none" stroke="#00874A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {borrowPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#fff" stroke="#00874A" strokeWidth={1.5} />
        ))}
        {data.map((d, i) =>
          i % 2 === 0 ? (
            <text key={i} x={borrowPts[i].x} y={H - 2} textAnchor="middle" fontSize={7.5} fill="#6B6E63" fontFamily="var(--font-body)">{d.label}</text>
          ) : null
        )}
      </svg>
    </div>
  )
}

function TopPatronsList({ patrons }: { patrons: TopPatron[] }) {
  if (patrons.length === 0) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No borrowing activity yet.</p>
  }
  const max = patrons[0].count
  return (
    <ul className="flex flex-col gap-2.5 w-full">
      {patrons.map((p, i) => (
        <li key={p.id} className="flex items-center gap-2.5">
          <span className="text-ink-400 w-4 text-right shrink-0" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-ink-900 font-medium truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                {p.name}
              </span>
              <span className="text-ink-500 ml-2 shrink-0" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                {p.count} books
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${(p.count / max) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ProgramUsageList({ data }: { data: ProgramUsage[] }) {
  if (data.length === 0) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No borrowing activity yet.</p>
  }
  const max = Math.max(1, ...data.map((d) => d.loans))
  return (
    <div className="flex flex-col gap-2.5 w-full">
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0" />
        <span className="flex-1" />
        <span className="text-ink-300 uppercase w-7 text-right shrink-0" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>Users</span>
        <span className="text-ink-300 uppercase w-7 text-right shrink-0" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>Loans</span>
      </div>
      {data.map((d) => (
        <div key={d.program} className="flex items-center gap-3">
          <span className="text-ink-700 w-28 truncate shrink-0" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {d.program}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(d.loans / max) * 100}%` }} />
          </div>
          <span className="text-ink-400 w-7 text-right shrink-0" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
            {d.users}
          </span>
          <span className="text-ink-900 font-semibold w-7 text-right shrink-0" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
            {d.loans}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Shelf copy status pill — matches book_copies.status values ───────────────
const SHELF_STATUS_CFG: Record<string, { label: string; text: string; bg: string }> = {
  available:       { label: "Available",       text: "text-[#16A34A]", bg: "bg-[#DCFCE7]" },
  on_loan:         { label: "On Loan",         text: "text-[#0369A1]", bg: "bg-[#E0F2FE]" },
  reserved:        { label: "Reserved",        text: "text-[#C2730A]", bg: "bg-[#FEF3C7]" },
  for_reshelving:  { label: "For Reshelving",  text: "text-ink-600",   bg: "bg-ink-100"    },
  missing:         { label: "Missing",         text: "text-[#6D28D9]", bg: "bg-[#EDE9FE]" },
}

function ShelfStatusBadge({ status }: { status: string }) {
  const cfg = SHELF_STATUS_CFG[status] ?? { label: status, text: "text-ink-600", bg: "bg-ink-100" }
  return (
    <span
      className={cn("inline-flex items-center px-2 py-0.5 rounded-pill font-medium whitespace-nowrap", cfg.bg, cfg.text)}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Shelf List — full report tab, physical copies in call-number order ───────
function ShelfListTable({ rows, onExport }: { rows: ShelfListRow[]; onExport: () => void }) {
  const [sortKey, setSortKey] = useState<ShelfSortKey>("call_number")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const handleSort = (key: ShelfSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"))
      if (sortDir === "desc") setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filtered = query.trim()
    ? rows.filter((r) => {
        const q = query.toLowerCase()
        return r.title.toLowerCase().includes(q) || r.call_number.toLowerCase().includes(q) || r.accession_number.toLowerCase().includes(q)
      })
    : rows

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    const va = a[sortKey] ?? ""
    const vb = b[sortKey] ?? ""
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  const SortIcon = ({ k }: { k: ShelfSortKey }) => {
    if (sortKey !== k || !sortDir) return <ChevronsUpDown size={12} className="text-ink-300" />
    return sortDir === "asc" ? <ChevronUp size={12} className="text-green-600" /> : <ChevronDown size={12} className="text-green-600" />
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / REPORT_PAGE_SIZE))
  const paged = sorted.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE)

  const filterKey = `${query}|${sortKey}|${sortDir}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})
  const available = statusCounts.available ?? 0
  const onLoan = statusCounts.on_loan ?? 0
  const needsAttention = (statusCounts.reserved ?? 0) + (statusCounts.for_reshelving ?? 0) + (statusCounts.missing ?? 0)

  return (
    <ReportTableCard
      title="Shelf list"
      subtitle={`Physical copies in call-number order · ${rows.length} ${rows.length === 1 ? "copy" : "copies"}`}
      query={query}
      onQueryChange={setQuery}
      onExport={onExport}
      exportDisabled={rows.length === 0}
      footerLeft={`${available} available · ${onLoan} on loan · ${needsAttention} needing attention`}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    >
      {paged.length === 0 ? (
        <EmptyState text={rows.length === 0 ? "No books match this filter." : "No copies match your search."} />
      ) : (
        <div className="rounded border border-ink-200 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {([
                  { label: "Accession", key: "accession_number" as ShelfSortKey },
                  { label: "Title", key: "title" as ShelfSortKey },
                  { label: "Call Number", key: "call_number" as ShelfSortKey },
                  { label: "Location", key: null },
                  { label: "Status", key: null },
                ]).map((col) => (
                  <th
                    key={col.label}
                    className={cn("text-left py-2.5 px-4 text-ink-500 font-semibold uppercase select-none", col.key ? "cursor-pointer hover:text-ink-800" : "")}
                    onClick={() => col.key && handleSort(col.key)}
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
                  >
                    <span className="flex items-center gap-1">{col.label}{col.key && <SortIcon k={col.key} />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr key={row.accession_number} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                  <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}>{row.accession_number}</td>
                  <td className="py-2.5 px-4 text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{row.title}</td>
                  <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}>{row.call_number}</td>
                  <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{row.shelf_location ?? "Unassigned"}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap"><ShelfStatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportTableCard>
  )
}

// ─── Catalogue — full report tab, one row per title ────────────────────────────
function CatalogueTable({ books, onExport }: { books: Book[]; onExport: () => void }) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const filtered = query.trim()
    ? books.filter((b) => {
        const q = query.toLowerCase()
        return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.category.toLowerCase().includes(q)
      })
    : books

  const totalPages = Math.max(1, Math.ceil(filtered.length / REPORT_PAGE_SIZE))
  const paged = filtered.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE)

  const filterKey = query
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  return (
    <ReportTableCard
      title="Catalogue report"
      subtitle={`All titles in the collection, ${books.length} records`}
      query={query}
      onQueryChange={setQuery}
      onExport={onExport}
      exportDisabled={books.length === 0}
      footerLeft={`Showing ${paged.length} of ${filtered.length} titles`}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    >
      {paged.length === 0 ? (
        <EmptyState text={books.length === 0 ? "No books in the catalog yet." : "No titles match your search."} />
      ) : (
        <div className="rounded border border-ink-200 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {["Title", "Author", "Category", "Copies", "Year"].map((label) => (
                  <th key={label} className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((b) => (
                <tr key={b.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                  <td className="py-2.5 px-4 text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{b.title}</td>
                  <td className="py-2.5 px-4 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{b.author}</td>
                  <td className="py-2.5 px-4 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{b.category}</td>
                  <td className="py-2.5 px-4 text-ink-700" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}>{b.total_copies ?? 1}</td>
                  <td className="py-2.5 px-4 text-ink-700" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}>{b.published_year ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportTableCard>
  )
}

// ─── Circulation — full report tab, one row per borrow/return event ───────────
type CirculationRow = { id: string; date: string; title: string; patron: string; type: "Borrow" | "Return"; due: string }

function buildCirculationRows(feed: FeedItem[], dateFrom?: string, dateTo?: string): CirculationRow[] {
  const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
  const toTs = dateTo ? new Date(dateTo).getTime() : null
  return feed
    .filter((f) => f.type !== "reserve")
    .filter((f) => (fromTs === null || f.timestamp >= fromTs) && (toTs === null || f.timestamp <= toTs))
    .map((f) => ({
      id: f.id,
      date: new Date(f.timestamp).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      title: f.item,
      patron: f.user,
      type: f.type === "checkout" ? "Borrow" : "Return",
      due: f.type === "checkout" && f.loan?.due_date ? new Date(f.loan.due_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—",
    }))
}

function CirculationTable({ rows, onExport }: { rows: CirculationRow[]; onExport: () => void }) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const filtered = query.trim()
    ? rows.filter((r) => {
        const q = query.toLowerCase()
        return r.title.toLowerCase().includes(q) || r.patron.toLowerCase().includes(q)
      })
    : rows

  const totalPages = Math.max(1, Math.ceil(filtered.length / REPORT_PAGE_SIZE))
  const paged = filtered.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE)

  const filterKey = query
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const borrows = rows.filter((r) => r.type === "Borrow").length
  const returns = rows.filter((r) => r.type === "Return").length

  return (
    <ReportTableCard
      title="Circulation report"
      subtitle="Movement of books in and out of the collection"
      query={query}
      onQueryChange={setQuery}
      onExport={onExport}
      exportDisabled={rows.length === 0}
      footerLeft={`${rows.length} transactions in range · ${borrows} borrows, ${returns} returns`}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    >
      {paged.length === 0 ? (
        <EmptyState text={rows.length === 0 ? "No circulation activity in this range." : "No transactions match your search."} />
      ) : (
        <div className="rounded border border-ink-200 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {["Date", "Title", "Patron", "Type", "Due"].map((label) => (
                  <th key={label} className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                  <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{r.date}</td>
                  <td className="py-2.5 px-4 text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{r.title}</td>
                  <td className="py-2.5 px-4 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{r.patron}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={cn("inline-flex items-center px-2 py-0.5 rounded-pill font-medium", r.type === "Borrow" ? "bg-info-bg text-info" : "bg-success-bg text-success")}
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{r.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportTableCard>
  )
}

// ─── Requests — faculty book-request inbox. Faculty submit from
// /student/requests (require_faculty at the API); this lists every one and
// lets a librarian move it through pending -> approved/rejected ->
// (approved only) fulfilled. See migrations/0039_book_requests.sql.
const REQUEST_STATUS_LABEL: Record<BookRequestStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected", fulfilled: "Fulfilled",
}
const REQUEST_STATUS_BADGE: Record<BookRequestStatus, string> = {
  pending: "bg-warn-bg text-warn",
  approved: "bg-info-bg text-info",
  rejected: "bg-danger-bg text-danger",
  fulfilled: "bg-success-bg text-success",
}

type RequestTabKey = "all" | BookRequestStatus

const REQUEST_TABS: { key: RequestTabKey; label: string; showCount: boolean }[] = [
  { key: "all",       label: "All",       showCount: false },
  { key: "pending",   label: "Pending",   showCount: true },
  { key: "approved",  label: "Approved",  showCount: true },
  { key: "rejected",  label: "Rejected",  showCount: false },
  { key: "fulfilled", label: "Fulfilled", showCount: false },
]

function RequestsPanel({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [requests, setRequests] = useState<BookRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<RequestTabKey>("all")
  const [query, setQuery] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function load() {
    setLoading(true)
    fetchBookRequests().then(setRequests).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleDecision(r: BookRequest, status: BookRequestStatus) {
    setBusyId(r.id)
    try {
      await updateBookRequest(r.id, status)
      showToast(`"${r.title}" marked ${status}.`)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update this request")
    } finally {
      setBusyId(null)
    }
  }

  // Respects the same page-level Date Range control every other full-report
  // tab uses (see activeDateBounds) instead of a second, duplicate control
  // just for this tab.
  const inRange = requests.filter((r) => {
    const t = new Date(r.created_at).getTime()
    if (dateFrom && t < new Date(dateFrom).getTime()) return false
    if (dateTo && t > new Date(dateTo).getTime()) return false
    return true
  })

  const tabCounts: Record<RequestTabKey, number> = {
    all: inRange.length,
    pending: inRange.filter((r) => r.status === "pending").length,
    approved: inRange.filter((r) => r.status === "approved").length,
    rejected: inRange.filter((r) => r.status === "rejected").length,
    fulfilled: inRange.filter((r) => r.status === "fulfilled").length,
  }

  const byTab = activeTab === "all" ? inRange : inRange.filter((r) => r.status === activeTab)

  const filtered = query.trim()
    ? byTab.filter((r) => {
        const q = query.toLowerCase()
        return (
          r.title.toLowerCase().includes(q) ||
          (r.author ?? "").toLowerCase().includes(q) ||
          (r.profiles?.full_name ?? "").toLowerCase().includes(q) ||
          (r.profiles?.email ?? "").toLowerCase().includes(q)
        )
      })
    : byTab

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const openCount = inRange.filter((r) => r.status === "pending").length

  return (
    <div className="flex flex-col gap-3">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 bg-ink-900 text-white px-4 py-2.5 rounded-(--radius) shadow-lg"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {toast}
        </div>
      )}

      <div className="flex overflow-x-auto scrollbar-none">
        {REQUEST_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setActiveTab(tab.key); setPage(1) }}
            className={cn(
              "flex items-center gap-1.5 py-2 px-3 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0",
              activeTab === tab.key ? "border-green-700 text-green-700" : "border-transparent text-ink-500 hover:text-ink-900"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {tab.label}
            {tab.showCount && tabCounts[tab.key] > 0 && (
              <span
                className={cn(
                  "flex items-center justify-center rounded-full min-w-4 h-4 px-1 font-semibold shrink-0",
                  activeTab === tab.key ? "bg-green-700 text-white" : "bg-ink-200 text-ink-500"
                )}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <ReportTableCard
        title="Wishlist and request log"
        subtitle="Titles requested by faculty"
        query={query}
        onQueryChange={(v) => { setQuery(v); setPage(1) }}
        searchPlaceholder="Search by title, author, or requester…"
        onExport={() => downloadCsv("book-requests.csv", filtered.map((r) => ({
          Title: r.title,
          Author: r.author ?? "",
          ISBN: r.isbn ?? "",
          Format: r.format,
          Copies: r.copies,
          Course: r.course ?? "",
          Requester: r.profiles?.full_name ?? "",
          Email: r.profiles?.email ?? "",
          Status: r.status,
          Attachments: r.attachments.map((a) => a.url).join("; "),
          "Requested At": r.created_at,
        })))}
        exportDisabled={filtered.length === 0}
        footerLeft={`${openCount} open request${openCount === 1 ? "" : "s"}`}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      >
        {loading ? (
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>Loading…</p>
        ) : paged.length === 0 ? (
          <EmptyState text={requests.length === 0 ? "No requests yet." : "No requests match your search."} />
        ) : (
          <div className="rounded border border-ink-200 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50">
                  {["Title", "Requester", "Status", "Requested", "Actions"].map((label) => (
                    <th
                      key={label}
                      className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                    <td className="py-2.5 px-4">
                      <p className="text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{r.title}</p>
                      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                        {[r.author, `${r.copies} ${r.copies === 1 ? "copy" : "copies"}`, r.format, r.course].filter(Boolean).join(" · ")}
                      </p>
                      {r.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5">
                          {r.attachments.map((a) => (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-green-700 hover:text-green-900 transition-colors"
                              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                            >
                              <Paperclip size={11} />
                              {a.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {r.profiles?.full_name ?? "Unknown"}
                      <div className="text-ink-400" style={{ fontSize: "var(--text-2xs)" }}>{r.profiles?.email}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={cn("inline-flex items-center px-2 py-0.5 rounded-pill font-medium", REQUEST_STATUS_BADGE[r.status])}
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                      >
                        {REQUEST_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {new Date(r.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-2.5 px-4">
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDecision(r, "rejected")}
                            disabled={busyId === r.id}
                            className="px-2.5 py-1 rounded border border-ink-200 bg-white text-ink-700 hover:bg-ink-100 disabled:opacity-40 transition-colors"
                            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleDecision(r, "approved")}
                            disabled={busyId === r.id}
                            className="px-2.5 py-1 rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-40 transition-colors font-medium"
                            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                          >
                            Approve
                          </button>
                        </div>
                      ) : r.status === "approved" ? (
                        <button
                          onClick={() => handleDecision(r, "fulfilled")}
                          disabled={busyId === r.id}
                          className="px-2.5 py-1 rounded bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-40 transition-colors font-medium"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                        >
                          Mark Fulfilled
                        </button>
                      ) : (
                        <span className="text-ink-300" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportTableCard>
    </div>
  )
}

// ─── Weeding tab — Reports plan Phase 2 ────────────────────────────────────────
// A deterministic heuristic (low/zero borrows + old) decides what's a
// candidate; AI only narrates that finding in plain English (candidate.reason).
// The librarian makes every real decision — Archive or Keep — nothing here
// removes a book on its own.
function WeedingPanel() {
  const [candidates, setCandidates] = useState<WeedingCandidate[]>([])
  const [events, setEvents] = useState<WeedingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [logQuery, setLogQuery] = useState("")
  const [logPage, setLogPage] = useState(1)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function load() {
    setLoading(true)
    Promise.all([fetchWeedingCandidates(), fetchWeedingEvents()])
      .then(([c, e]) => { setCandidates(c); setEvents(e) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleArchive(c: WeedingCandidate) {
    setBusyId(c.book_id)
    try {
      await archiveBook(c.book_id, c.reason)
      showToast(`"${c.title}" archived.`)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not archive this book.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleDismiss(c: WeedingCandidate) {
    setBusyId(c.book_id)
    try {
      await dismissWeedingCandidate(c.book_id)
      showToast(`"${c.title}" kept — won't be flagged again.`)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not dismiss this candidate.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRestore(bookId: string, title: string | null) {
    setBusyId(bookId)
    try {
      await restoreBook(bookId)
      showToast(`"${title ?? "Book"}" restored to the catalog.`)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not restore this book.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 bg-ink-900 text-white px-4 py-2.5 rounded-(--radius) shadow-lg"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {toast}
        </div>
      )}

      {/* Candidates */}
      <div className="rounded border border-ink-200 bg-white p-5 flex flex-col gap-4" style={{ boxShadow: "var(--shadow)" }}>
        <div>
          <h2
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
          >
            Weeding candidates
          </h2>
          <p className="text-ink-400 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Flagged by a fixed rule — low or zero borrows over 2 years, and at least 10 years old. AI only explains the finding; you decide.
          </p>
        </div>

        {loading ? (
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>Loading…</p>
        ) : candidates.length === 0 ? (
          <EmptyState text="No weeding candidates right now." />
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.map((c) => (
              <div
                key={c.book_id}
                className="rounded border border-ink-100 bg-ink-50 p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                    {c.title}
                  </p>
                  <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                    {c.author} · {programLabel(c.category)}{c.published_year ? ` · ${c.published_year}` : ""}
                  </p>
                  <p className="text-ink-600 mt-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    {c.reason}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleDismiss(c)}
                    disabled={busyId === c.book_id}
                    className="px-3 py-1.5 rounded border border-ink-200 bg-white text-ink-700 hover:bg-ink-100 disabled:opacity-40 transition-colors"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => handleArchive(c)}
                    disabled={busyId === c.book_id}
                    className="px-3 py-1.5 rounded bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-40 transition-colors font-medium"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log */}
      {(() => {
        const filteredEvents = logQuery.trim()
          ? events.filter((e) => {
              const q = logQuery.toLowerCase()
              return (e.book_title ?? "").toLowerCase().includes(q) || (e.performed_by_name ?? "").toLowerCase().includes(q)
            })
          : events
        const totalPages = Math.max(1, Math.ceil(filteredEvents.length / REPORT_PAGE_SIZE))
        const paged = filteredEvents.slice((logPage - 1) * REPORT_PAGE_SIZE, logPage * REPORT_PAGE_SIZE)
        const exportLog = () => downloadCsv("weeding-log.csv", events.map((e) => ({
          book: e.book_title ?? "",
          action: e.event_type,
          by: e.performed_by_name ?? "",
          when: e.occurred_at,
        })))

        return (
          <ReportTableCard
            title="Weeding log"
            subtitle="Archive, restore and dismiss actions on record"
            query={logQuery}
            onQueryChange={(v) => { setLogQuery(v); setLogPage(1) }}
            searchPlaceholder="Search book or librarian…"
            onExport={exportLog}
            exportDisabled={events.length === 0}
            footerLeft={`${events.length} ${events.length === 1 ? "action" : "actions"} recorded`}
            page={logPage}
            totalPages={totalPages}
            onPageChange={setLogPage}
          >
            {paged.length === 0 ? (
              <EmptyState text={events.length === 0 ? "No weeding actions recorded yet." : "No actions match your search."} />
            ) : (
              <div className="rounded border border-ink-200 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50">
                      {["Book", "Action", "By", "When", ""].map((label) => (
                        <th
                          key={label}
                          className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((e) => (
                      <tr key={e.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                        <td className="py-2.5 px-4 text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                          {e.book_title ?? "—"}
                        </td>
                        <td className="py-2.5 px-4 text-ink-700 capitalize" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                          {e.event_type}
                        </td>
                        <td className="py-2.5 px-4 text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                          {e.performed_by_name ?? "—"}
                        </td>
                        <td className="py-2.5 px-4 text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                          {new Date(e.occurred_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="py-2.5 px-4">
                          {e.event_type === "archived" && (
                            <button
                              onClick={() => handleRestore(e.book_id, e.book_title)}
                              disabled={busyId === e.book_id}
                              className="text-green-700 hover:underline disabled:opacity-40 font-medium"
                              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportTableCard>
        )
      })()}
    </div>
  )
}

// ─── Activity log table ─────────────────────────────────────────────────────
const ACTIVITY_PAGE_SIZE = 10

function ActivityLogTable({
  feed,
  onExport,
  patrons,
  onSelectUser,
  onSelectItem,
  dateFrom,
  dateTo,
}: {
  feed: FeedItem[]
  onExport: () => void
  patrons: UserProfile[]
  onSelectUser: (patron: UserProfile) => void
  /** Opens the Activity Detail side panel (same one the dashboard's Recent
   *  Activity table uses) for the clicked row's event. */
  onSelectItem: (item: FeedItem) => void
  /** ISO bounds from the page-level Date Range filter bar above the tabs —
   *  this tab doesn't have its own date control, it just respects that one. */
  dateFrom?: string
  dateTo?: string
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
  const toTs = dateTo ? new Date(dateTo).getTime() : null

  const filtered = feed.filter((tx) => {
    if (fromTs !== null && tx.timestamp < fromTs) return false
    if (toTs !== null && tx.timestamp > toTs) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return tx.user.toLowerCase().includes(q) || tx.item.toLowerCase().includes(q)
  })

  const filterKey = `${query}|${dateFrom}|${dateTo}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / ACTIVITY_PAGE_SIZE))
  const paged = filtered.slice((page - 1) * ACTIVITY_PAGE_SIZE, page * ACTIVITY_PAGE_SIZE)

  return (
    <ReportTableCard
      title="Activity log"
      subtitle="Every checkout, return and reservation in range"
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search patron or title…"
      onExport={onExport}
      exportDisabled={filtered.length === 0}
      footerLeft={`${filtered.length} ${filtered.length === 1 ? "event" : "events"} in range`}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    >
      {paged.length === 0 ? (
        <EmptyState text="No activity found." />
      ) : (
        <div className="rounded border border-ink-200 overflow-x-auto">
          <table className="w-full min-w-150">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {["Date", "Time", "Type", "User", "Item"].map((label) => (
                  <th
                    key={label}
                    className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase select-none"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((tx) => {
                const cfg = TX_CONFIG[tx.type]
                const patron = tx.userId ? patrons.find((p) => p.id === tx.userId) : undefined
                return (
                  <tr
                    key={tx.id}
                    onClick={() => onSelectItem(tx)}
                    className="border-b border-ink-100 hover:bg-ink-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {tx.date}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {tx.time}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-pill", cfg.bg)} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                        <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {patron ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSelectUser(patron) }}
                          className="text-ink-900 font-medium hover:text-green-700 hover:underline underline-offset-2 transition-colors text-left"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                        >
                          {tx.user}
                        </button>
                      ) : (
                        <p className="text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                          {tx.user}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-80">
                      <p className="text-ink-700 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                        {tx.item}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ReportTableCard>
  )
}

// ─── Overdue table ────────────────────────────────────────────────────────────
function OverdueTable({ rows, onExport }: { rows: OverdueRow[]; onExport: () => void }) {
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"))
      if (sortDir === "desc") setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filteredRows = query.trim()
    ? rows.filter((r) => {
        const q = query.toLowerCase()
        return r.patron.toLowerCase().includes(q) || r.book.toLowerCase().includes(q) || r.patronEmail.toLowerCase().includes(q)
      })
    : rows

  const sorted = [...filteredRows].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    let va: string | number = ""
    let vb: string | number = ""
    if (sortKey === "patron") { va = a.patron; vb = b.patron }
    if (sortKey === "book")   { va = a.book;   vb = b.book   }
    if (sortKey === "due")    { va = a.dueDate; vb = b.dueDate }
    if (sortKey === "days")   { va = a.daysOverdue; vb = b.daysOverdue }
    if (sortKey === "program"){ va = a.program; vb = b.program }
    if (typeof va === "number") return sortDir === "asc" ? va - (vb as number) : (vb as number) - va
    return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
  })

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k || !sortDir) return <ChevronsUpDown size={12} className="text-ink-300" />
    return sortDir === "asc" ? <ChevronUp size={12} className="text-green-600" /> : <ChevronDown size={12} className="text-green-600" />
  }

  const totalFine = rows.reduce((s, b) => s + b.fine, 0)

  const PAGE_SIZE = REPORT_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pagedRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const filterKey = `${query}|${sortKey}|${sortDir}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const patronsAffected = new Set(rows.map((r) => r.patronEmail)).size

  return (
    <ReportTableCard
      title="Overdue books"
      subtitle="Loans past their due date, with the fine owed on each"
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search patron or book…"
      onExport={onExport}
      exportDisabled={rows.length === 0}
      footerLeft={`${rows.length} overdue · ₱${totalFine.toFixed(2)} total fines · ${patronsAffected} ${patronsAffected === 1 ? "patron" : "patrons"} affected`}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    >
      {sorted.length === 0 ? (
        <EmptyState text={rows.length === 0 ? "Nothing overdue right now." : "No overdue books match your search."} />
      ) : (
        <div className="rounded border border-ink-200 overflow-x-auto">
          <table className="w-full min-w-175">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {[
                  { label: "Patron",   key: "patron" as SortKey },
                  { label: "Program / Year", key: "program" as SortKey },
                  { label: "Book",     key: "book"   as SortKey },
                  { label: "Due Date", key: "due"    as SortKey },
                  { label: "Days Overdue", key: "days" as SortKey },
                  { label: "Fine", key: null },
                  { label: "Status",   key: null },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={cn(
                      "text-left py-2.5 px-4 text-ink-500 font-semibold uppercase select-none",
                      col.key ? "cursor-pointer hover:text-ink-800 group" : ""
                    )}
                    onClick={() => col.key && handleSort(col.key)}
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "var(--text-2xs)",
                      letterSpacing: "var(--tracking-eyebrow)",
                    }}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.key && <SortIcon k={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
                  <td className="py-3 px-4">
                    <p
                      className="text-ink-900 font-medium"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                    >
                      {row.patron}
                    </p>
                    <p
                      className="text-ink-400"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}
                    >
                      {row.patronEmail}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <p
                      className="text-ink-700"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      {row.program}
                    </p>
                    <p
                      className="text-ink-400"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      {row.year}
                    </p>
                  </td>
                  <td className="py-3 px-4 max-w-50">
                    <p
                      className="text-ink-900 font-medium truncate"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                    >
                      {row.book}
                    </p>
                    <p
                      className="text-ink-400"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      {row.author}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <p
                      className="text-ink-700"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                    >
                      {new Date(row.dueDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-semibold",
                        row.daysOverdue >= 10
                          ? "bg-red-100 text-red-700"
                          : row.daysOverdue >= 5
                          ? "bg-amber-100 text-amber-700"
                          : "bg-yellow-50 text-yellow-700"
                      )}
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      {row.daysOverdue >= 7 && <AlertTriangle size={10} />}
                      {row.daysOverdue}d
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <p
                      className="text-ink-900 font-semibold"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                    >
                      ₱{row.fine.toFixed(2)}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className="inline-block px-2 py-0.5 rounded-sm bg-red-50 text-red-700 font-medium"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      Overdue
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportTableCard>
  )
}

// ─── Fines table — library-wide, not just currently-overdue loans ─────────────
function FinesTable({ rows, onExport }: { rows: FineRow[]; onExport: () => void }) {
  const [query, setQuery] = useState("")

  const filtered = query.trim()
    ? rows.filter((r) => {
        const q = query.toLowerCase()
        return r.patron.toLowerCase().includes(q) || r.patron_email.toLowerCase().includes(q)
      })
    : rows

  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0)
  const patronsOwing = rows.filter((r) => r.outstanding > 0).length

  const totalPages = Math.max(1, Math.ceil(filtered.length / REPORT_PAGE_SIZE))
  const paged = filtered.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE)

  const filterKey = query
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  return (
    <ReportTableCard
      title="Patron fines"
      subtitle="Every patron with a fine in this range — unsettled, still accruing on an open loan, or already paid"
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search patron…"
      onExport={onExport}
      exportDisabled={rows.length === 0}
      footerLeft={`₱${totalOutstanding.toFixed(2)} outstanding · ${patronsOwing} ${patronsOwing === 1 ? "patron" : "patrons"} with fines`}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    >
      {paged.length === 0 ? (
        <EmptyState text={rows.length === 0 ? "No fines on record for this range." : "No patrons match your search."} />
      ) : (
        <div className="rounded border border-ink-200 overflow-x-auto">
          <table className="w-full min-w-150">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                {["", "Patron", "Program / Year", "Unsettled", "Accruing", "Paid", "Outstanding"].map((label) => (
                  <th
                    key={label}
                    className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => {
                const isOpen = expanded === row.patron_id
                return (
                  <Fragment key={row.patron_id}>
                    <tr
                      className="border-b border-ink-100 hover:bg-ink-50 transition-colors cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : row.patron_id)}
                    >
                      <td className="py-3 pl-4 pr-1 w-6">
                        {isOpen ? <ChevronUp size={13} className="text-ink-400" /> : <ChevronDown size={13} className="text-ink-400" />}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{row.patron}</p>
                        <p className="text-ink-400" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>{row.patron_email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>{row.program}</p>
                        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>{row.year}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn("font-semibold", row.unsettled > 0 ? "text-red-600" : "text-ink-300")}
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                        >
                          ₱{row.unsettled.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn("font-semibold", row.accruing > 0 ? "text-amber-700" : "text-ink-300")}
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                        >
                          ₱{row.accruing.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                          ₱{row.paid.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn("font-bold", row.outstanding > 0 ? "text-ink-900" : "text-ink-300")}
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                        >
                          ₱{row.outstanding.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-ink-100 bg-ink-50">
                        <td colSpan={7} className="px-4 py-3">
                          {row.entries.length === 0 ? (
                            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                              No line-item detail on record for this patron.
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-2">
                              {row.entries.map((entry, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 bg-white rounded border border-ink-200 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-ink-900 font-medium truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                                      {entry.title}
                                    </p>
                                    <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                                      {entry.detail}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span
                                      className={cn(
                                        "px-2 py-0.5 rounded-sm border font-semibold",
                                        entry.kind === "unsettled" && "bg-danger-bg text-danger border-danger/30",
                                        entry.kind === "accruing" && "bg-warn-bg text-warn border-warn/30",
                                        entry.kind === "paid" && "bg-success-bg text-success border-success/30"
                                      )}
                                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                                    >
                                      {entry.kind === "unsettled" ? "Unsettled" : entry.kind === "accruing" ? "Accruing" : "Paid"}
                                    </span>
                                    <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                                      ₱{entry.amount.toFixed(2)}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ReportTableCard>
  )
}

function dateRangePresetLabel(preset: DateRangePreset): string {
  return preset === "all" ? "All time" : preset === "week" ? "This week" : preset === "month" ? "This month" : preset === "semester" ? "Semester" : "Custom"
}

// ─── Custom filter dropdown — a native <select>'s open popup can't be
// restyled (its own scrollbar/arrows are OS chrome, not CSS-able), so this
// renders the option list ourselves in a plain scrollable div instead. ──────
function FilterDropdown({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="min-w-36 text-left px-3 py-1.5 rounded border border-ink-300 bg-white text-ink-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {value}
        </button>
        {open && (
          <ul
            role="listbox"
            className="absolute left-0 z-30 mt-1 w-full min-w-max max-h-56 overflow-y-auto rounded border border-ink-200 bg-white py-1"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            {options.map((o) => (
              <li key={o} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o === value}
                  onClick={() => { onChange(o); setOpen(false) }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 whitespace-nowrap hover:bg-ink-50 transition-colors",
                    o === value ? "text-green-700 font-medium bg-green-50" : "text-ink-700"
                  )}
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function ReportsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<ReportTab>(() => {
    const t = searchParams.get("tab")
    const valid: ReportTab[] = ["catalogue", "shelf-list", "circulation", "overdue", "requests", "weeding", "activity"]
    return (valid as string[]).includes(t ?? "") ? (t as ReportTab) : "overview"
  })

  // `books` populates the Category/Program filter dropdowns and is the full
  // per-title data source for the Catalogue tab. `patrons` does that too,
  // but is also how the Activity Log tab resolves a feed row's user id back
  // to a full profile for the click-to-view-account popup below.
  const [books, setBooks] = useState<Book[]>([])
  const [patrons, setPatrons] = useState<UserProfile[]>([])
  // Fixed heuristic, not affected by the report filters — fetched once so
  // both the Overview preview and the Weeding tab's own count agree.
  const [weedingCandidates, setWeedingCandidates] = useState<WeedingCandidate[]>([])

  // Overview dashboard card order — Sprint 5.6.1, draggable.
  const [cardOrder, setCardOrder] = useState<string[]>(["catalogue", "circulation", "patrons", "trends", "library-stats", "weeding"])

  useEffect(() => {
    Promise.all([fetchBooks(), fetchPatrons(), fetchWeedingCandidates()])
      .then(([b, p, w]) => { setBooks(b); setPatrons(p); setWeedingCandidates(w) })
      .catch(() => {})
  }, [])

  // Activity Log tab — click a user to view their account, same
  // PatronProfileModal/ConfirmStatusDialog + real updatePatronStatus call
  // the Patrons page uses (see app/librarian/patrons/page.tsx).
  const [viewingPatron, setViewingPatron] = useState<UserProfile | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<UserProfile | null>(null)

  // Activity Log tab — click a row to open the same slide-in detail panel
  // the dashboard's Recent Activity table uses (see ActivityDetailPanel).
  const [selectedActivity, setSelectedActivity] = useState<FeedItem | null>(null)

  async function handleToggleStatus(userId: string) {
    const current = patrons.find((p) => p.id === userId)
    const nextStatus = current?.status === "inactive" ? "active" : "inactive"

    setPatrons((prev) => prev.map((p) => (p.id === userId ? { ...p, status: nextStatus } : p)))
    setConfirmingStatus(null)
    setViewingPatron((v) => (v && v.id === userId ? { ...v, status: nextStatus } : v))

    try {
      await updatePatronStatus(userId, nextStatus)
    } catch {
      // Revert on failure — the optimistic update above was wrong.
      setPatrons((prev) => prev.map((p) => (p.id === userId ? { ...p, status: current?.status } : p)))
    }
  }

  // Activity Log / Circulation tabs — same real loans/reservations rows the
  // dashboard's "Recent Activity" preview uses (see lib/activity.ts).
  const [loans, setLoans] = useState<Loan[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])

  useEffect(() => {
    Promise.all([fetchLoans(), fetchReservations()])
      .then(([l, r]) => { setLoans(l); setReservations(r) })
      .catch(() => {})
  }, [])

  const activityFeed = buildFeed(loans, reservations)

  // Filter state – Sprint 5.6.2, now actually wired (Reports plan Phase 1)
  const [dateRange, setDateRange]   = useState<DateRangePreset>("month")
  const [fromDate, setFromDate]     = useState("")
  const [toDate, setToDate]         = useState("")
  const [category, setCategory]     = useState("All Categories")
  const [program, setProgram]       = useState("All Programs")
  const [yearLevel, setYearLevel]   = useState("All Year Levels")

  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [catalogueData, setCatalogueData] = useState<CatalogueSlice[]>([])
  const [circulationData, setCirculationData] = useState<Bucket[]>([])
  const [trendData, setTrendData] = useState<TransactionTrendPoint[]>([])
  const [allPatronsData, setAllPatronsData] = useState<TopPatron[]>([])
  const [overdueRowsData, setOverdueRowsData] = useState<OverdueRow[]>([])
  const [finesData, setFinesData] = useState<FineRow[]>([])
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null)
  const [shelfListData, setShelfListData] = useState<ShelfListRow[]>([])
  const topPatronsData = allPatronsData.slice(0, 5)

  // Reports plan Phase 3 — never auto-fetched. Cleared (not left stale)
  // whenever any filter changes, so an AI sentence can never sit next to
  // numbers it no longer describes.
  const [summaries, setSummaries] = useState<ReportSummaries | null>(null)
  const [summarizing, setSummarizing] = useState(false)

  const currentFilters = useCallback((): ReportFilters => {
    const { dateFrom, dateTo } = resolveDateRange(dateRange, fromDate, toDate)
    return {
      dateFrom,
      dateTo,
      category: category === "All Categories" ? undefined : category,
      program: program === "All Programs" ? undefined : program,
      yearLevel: YEAR_LEVEL_LABELS[yearLevel],
    }
  }, [dateRange, fromDate, toDate, category, program, yearLevel])

  // Just the date half of currentFilters(), for the Activity Log / Circulation
  // tabs — neither has its own Date Range control, they respect this same
  // page-level filter bar instead of duplicating it.
  const activeDateBounds = resolveDateRange(dateRange, fromDate, toDate)

  useEffect(() => {
    const filters = currentFilters()
    setLoading(true)
    setSummaries(null)
    Promise.all([
      fetchCatalogueReport(filters),
      fetchCirculationSummary(filters),
      fetchTransactionTrend(filters),
      fetchTopPatrons(filters, 200),
      fetchOverdueReport(filters),
      fetchFinesReport(filters),
      fetchLibraryStats(filters),
      fetchShelfList(filters),
    ])
      .then(([cat, circ, trend, topP, overdue, fines, libStats, shelf]) => {
        setCatalogueData(cat)
        setCirculationData(circ)
        setTrendData(trend)
        setAllPatronsData(topP)
        setOverdueRowsData(overdue)
        setFinesData(fines)
        setLibraryStats(libStats)
        setShelfListData(shelf)
        setLastUpdated(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentFilters])

  async function handleGenerateInsights() {
    setSummarizing(true)
    try {
      setSummaries(await fetchReportSummaries(currentFilters()))
    } catch {
      setSummaries(null)
    } finally {
      setSummarizing(false)
    }
  }

  const handlePrint = () => window.print()

  const catalogueBooks = category === "All Categories" ? books : books.filter((b) => b.category === category)
  const circulationRows = buildCirculationRows(activityFeed, activeDateBounds.dateFrom, activeDateBounds.dateTo)

  const exportShelfListCsv = () => downloadCsv("shelf-list.csv", shelfListData.map((r) => ({
    accession_number: r.accession_number,
    call_number: r.call_number,
    title: r.title,
    author: r.author,
    category: programLabel(r.category),
    shelf_location: r.shelf_location ?? "",
    status: r.status,
  })))

  const exportCatalogueCsv = () => downloadCsv("catalogue.csv", catalogueBooks.map((b) => ({
    title: b.title,
    author: b.author,
    category: b.category,
    copies: b.total_copies ?? 1,
    year: b.published_year ?? "",
  })))

  const exportCirculationCsv = () => downloadCsv("circulation.csv", circulationRows.map((r) => ({
    date: r.date,
    title: r.title,
    patron: r.patron,
    type: r.type,
    due: r.due,
  })))

  const exportOverdueCsv = () => downloadCsv("overdue.csv", overdueRowsData.map((r) => ({
    patron: r.patron,
    email: r.patronEmail,
    program: r.program,
    year: r.year,
    book: r.book,
    author: r.author,
    due_date: r.dueDate,
    days_overdue: r.daysOverdue,
    fine: r.fine,
  })))

  const exportFinesCsv = () => downloadCsv("fines.csv", finesData.map((r) => ({
    patron: r.patron,
    email: r.patron_email,
    program: r.program,
    year: r.year,
    unsettled: r.unsettled,
    accruing: r.accruing,
    paid: r.paid,
    outstanding: r.outstanding,
  })))

  const exportActivityCsv = () => downloadCsv("activity-log.csv", activityFeed.map((tx) => ({
    date: tx.date,
    time: tx.time,
    type: TX_CONFIG[tx.type].label,
    user: tx.user,
    item: tx.item,
  })))

  // Header's global Export CSV button follows whichever tab is open —
  // Overview/Weeding/Requests have no single table to export, so it's
  // disabled there instead of guessing which one the librarian meant.
  const headerExport: { fn: () => void; disabled: boolean } | null = (() => {
    switch (tab) {
      case "catalogue":   return { fn: exportCatalogueCsv, disabled: catalogueBooks.length === 0 }
      case "shelf-list":  return { fn: exportShelfListCsv, disabled: shelfListData.length === 0 }
      case "circulation": return { fn: exportCirculationCsv, disabled: circulationRows.length === 0 }
      case "overdue":     return { fn: exportOverdueCsv, disabled: overdueRowsData.length === 0 }
      case "activity":    return { fn: exportActivityCsv, disabled: activityFeed.length === 0 }
      default:            return null
    }
  })()

  const quickStats = [
    { label: "Total Titles",     value: (libraryStats?.total_titles ?? 0).toLocaleString(), icon: <BookMarked size={18} />, color: "text-green-700", bg: "bg-green-50" },
    { label: "Active Borrowers", value: (libraryStats?.active_borrowers ?? 0).toLocaleString(), icon: <Users size={18} />,     color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Overdue",          value: overdueRowsData.length.toLocaleString(), icon: <AlertTriangle size={18} />, color: "text-red-700", bg: "bg-red-50" },
    { label: "Weeding Candidates", value: weedingCandidates.length.toLocaleString(), icon: <BarChart2 size={18} />, color: "text-gold-600", bg: "bg-gold-100" },
  ]

  // Overview dashboard cards — draggable (Sprint 5.6.1). Content only;
  // order lives in `cardOrder` below.
  const cardDefs: Record<string, React.ReactNode> = {
    catalogue: (
      <OverviewCard
        title="Catalogue report"
        subtitle={`${catalogueData.reduce((s, d) => s + d.value, 0)} titles across ${catalogueData.length} categories`}
        action={{ label: "Open full report", onClick: () => setTab("catalogue") }}
      >
        <CatalogueBarList data={catalogueData} />
      </OverviewCard>
    ),
    circulation: (
      <OverviewCard
        title="Circulation report"
        subtitle="Monthly borrows, last 6 months"
        corner={`${circulationData.reduce((s, d) => s + d.value, 0)} total`}
      >
        <BarChartViz data={circulationData} />
      </OverviewCard>
    ),
    patrons: (
      <OverviewCard
        title="Top patrons"
        subtitle="Highest borrowers in range"
        action={{ label: "Manage patrons", onClick: () => router.push("/librarian/patrons") }}
      >
        <TopPatronsList patrons={topPatronsData} />
      </OverviewCard>
    ),
    trends: (
      <OverviewCard title="Transaction statistics" subtitle="Weekly activity, last 8 weeks">
        <TransactionTrendChart data={trendData} />
      </OverviewCard>
    ),
    "library-stats": (
      <OverviewCard title="Library statistics" subtitle="Usage by program and year level">
        <ProgramUsageList data={libraryStats?.by_program ?? []} />
      </OverviewCard>
    ),
    weeding: (
      <OverviewCard
        title="Weeding log"
        subtitle="Flagged by the ten-year policy"
        action={{ label: `Review ${weedingCandidates.length}`, onClick: () => setTab("weeding") }}
      >
        {weedingCandidates.length === 0 ? (
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Nothing flagged right now.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-ink-100">
            {weedingCandidates.slice(0, 4).map((c) => (
              <li key={c.book_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-ink-900 font-medium truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                    {c.title}
                  </p>
                  <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                    {c.category}{c.published_year ? ` · ${c.published_year}` : ""}
                  </p>
                </div>
                <span
                  className="shrink-0 px-2 py-0.5 rounded-pill bg-amber-100 text-amber-700 font-medium"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                >
                  {c.years_since_added} yrs
                </span>
              </li>
            ))}
          </ul>
        )}
      </OverviewCard>
    ),
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (over && active.id !== over.id) {
      setCardOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as string)
        const newIdx = prev.indexOf(over.id as string)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  const aiSummaryText = summaries
    ? [summaries.catalogue, summaries.circulation, summaries.top_patrons, summaries.borrowing_trends, summaries.library_stats, summaries.transactions, summaries.overdue]
        .filter(Boolean)
        .join(" ")
    : ""

  const dateSubtitle = (() => {
    const label = dateRangePresetLabel(dateRange)
    const { dateFrom, dateTo } = activeDateBounds
    if (!dateFrom || !dateTo) return label
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
    const range = sameMonth
      ? `${from.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${to.getDate()}, ${to.getFullYear()}`
      : `${from.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} – ${to.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
    return `${label} · ${range}`
  })()
  const programSubtitle = program !== "All Programs" ? program.toLowerCase() : "all programs"

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-6">
      {/* ── Page header ───────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
          >
            Reports
          </h1>

          <div className="flex items-center gap-2 print:hidden shrink-0">
            <button
              onClick={() => headerExport?.fn()}
              disabled={!headerExport || headerExport.disabled}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-ink-300 text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-ink-300 text-ink-700 hover:bg-ink-50 transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              <Printer size={14} /> Print PDF
            </button>
            <button
              onClick={handleGenerateInsights}
              disabled={summarizing || loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              <Sparkles size={14} />
              {summarizing ? "Generating…" : "Generate Insights"}
            </button>
          </div>
        </div>
        <p
          className="text-ink-400"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {dateSubtitle} · {programSubtitle}{loading ? " · Loading…" : ""}
          {lastUpdated && (
            <span className="text-ink-300"> · Updated {lastUpdated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>
          )}
        </p>
      </div>

      {/* ── Filter bar – Sprint 5.6.2 ─────────────────────── */}
      <div className="rounded border border-ink-200 bg-white p-4 flex flex-wrap items-end gap-3 print:hidden" style={{ boxShadow: "var(--shadow)" }}>
        {/* Date range quick select */}
        <div className="flex flex-col gap-1">
          <label
            className="text-ink-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            Date Range
          </label>
          <div className="flex items-center gap-1 p-0.5 rounded bg-ink-100">
            {(["all", "week", "month", "semester", "custom"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={cn(
                  "px-3 py-1.5 rounded transition-colors",
                  dateRange === r ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
                )}
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {dateRangePresetLabel(r)}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date inputs */}
        {dateRange === "custom" && (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-1.5 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-1.5 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
          </div>
        )}

        {/* Dropdowns */}
        {[
          { label: "Category", value: category, setter: setCategory,
            options: ["All Categories", ...new Set(books.map((b) => b.category).filter(Boolean))] },
          { label: "Program", value: program, setter: setProgram,
            options: ["All Programs", ...new Set(patrons.map((p) => p.program).filter((p): p is string => !!p))] },
          { label: "Year Level", value: yearLevel, setter: setYearLevel,
            options: ["All Year Levels", "1st Year", "2nd Year", "3rd Year", "4th Year"] },
        ].map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <label className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {f.label}
            </label>
            <div className="relative">
              <select
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-ink-800"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>{programLabel(o)}</option>
                ))}
              </select>
              <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-ink-200 overflow-x-auto overflow-y-hidden print:hidden">
        {([
          { key: "overview",    label: "Overview" },
          { key: "activity",    label: "Activity Log" },
          { key: "catalogue",   label: "Catalogue" },
          { key: "shelf-list",  label: "Shelf List" },
          { key: "circulation", label: "Circulation" },
          { key: "overdue",     label: "Overdue & Fines" },
          { key: "requests",    label: "Requests" },
          { key: "weeding",     label: "Weeding" },
        ] as { key: ReportTab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap",
              tab === t.key
                ? "border-green-700 text-green-700"
                : "border-transparent text-ink-500 hover:text-ink-900"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {t.label}
            {t.key === "overdue" && overdueRowsData.length > 0 && (
              <span
                className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {overdueRowsData.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview tab – Sprint 5.6.1 & 5.6.3 ──────────── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickStats.map((s) => (
              <div key={s.label} className="rounded border border-ink-200 bg-white px-4 py-3 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
                <div className={cn("flex items-center justify-center w-9 h-9 rounded-sm shrink-0", s.bg)}>
                  <span className={s.color}>{s.icon}</span>
                </div>
                <div>
                  <p
                    className="text-ink-900 font-bold leading-tight"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xl)" }}
                  >
                    {s.value}
                  </p>
                  <p
                    className="text-ink-400 leading-tight"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                  >
                    {s.label}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* AI summary — one consolidated box, not one per card */}
          {summaries && aiSummaryText && (
            <div className="rounded border border-green-100 bg-green-50 p-4 flex items-start gap-2.5">
              <Sparkles size={14} className="text-green-700 mt-0.5 shrink-0" />
              <div>
                <p
                  className="text-green-800 uppercase font-semibold mb-1"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)" }}
                >
                  AI Summary
                </p>
                <p className="text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                  {aiSummaryText}
                </p>
              </div>
            </div>
          )}

          {/* Report preview grid — drag cards to rearrange */}
          <div>
            <p
              className="text-ink-400 mb-3 flex items-center gap-1.5"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              <GripVertical size={12} />
              Drag cards to rearrange the dashboard
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cardOrder} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {cardOrder.map((id) => (
                    <SortableOverviewCard key={id} id={id} full={id === "catalogue" || id === "weeding"}>
                      {(handle) => cloneElement(cardDefs[id] as React.ReactElement<{ dragHandle?: React.ReactNode }>, { dragHandle: handle })}
                    </SortableOverviewCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {/* ── Catalogue tab ──────────────────────────────────── */}
      {tab === "catalogue" && <CatalogueTable books={catalogueBooks} onExport={exportCatalogueCsv} />}

      {/* ── Shelf List tab ─────────────────────────────────── */}
      {tab === "shelf-list" && <ShelfListTable rows={shelfListData} onExport={exportShelfListCsv} />}

      {/* ── Circulation tab ────────────────────────────────── */}
      {tab === "circulation" && <CirculationTable rows={circulationRows} onExport={exportCirculationCsv} />}

      {/* ── Overdue & Fines tab – Sprint 5.6.4 ─────────────── */}
      {tab === "overdue" && (
        <div className="flex flex-col gap-6">
          {summaries?.overdue && (
            <p
              className="text-ink-700 bg-green-50 border border-green-100 rounded px-2.5 py-1.5 flex items-start gap-1.5 text-left"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              <Sparkles size={11} className="text-green-700 mt-0.5 shrink-0" />
              <span>{summaries.overdue}</span>
            </p>
          )}
          <OverdueTable rows={overdueRowsData} onExport={exportOverdueCsv} />
          <FinesTable rows={finesData} onExport={exportFinesCsv} />
        </div>
      )}

      {/* ── Requests tab — see RequestsPanel ── */}
      {tab === "requests" && (
        <RequestsPanel dateFrom={activeDateBounds.dateFrom} dateTo={activeDateBounds.dateTo} />
      )}

      {/* ── Weeding tab – Reports plan Phase 2 ────────────── */}
      {tab === "weeding" && <WeedingPanel />}

      {/* ── Activity Log tab ───────────────────────────────── */}
      {tab === "activity" && (
        <ActivityLogTable
          feed={activityFeed}
          onExport={exportActivityCsv}
          patrons={patrons}
          onSelectUser={setViewingPatron}
          onSelectItem={setSelectedActivity}
          dateFrom={activeDateBounds.dateFrom}
          dateTo={activeDateBounds.dateTo}
        />
      )}

      <ActivityDetailPanel
        item={selectedActivity}
        loans={loans}
        reservations={reservations}
        onClose={() => setSelectedActivity(null)}
      />

      {viewingPatron && (
        <PatronProfileModal
          patron={viewingPatron}
          onClose={() => setViewingPatron(null)}
          onToggleStatus={() => setConfirmingStatus(viewingPatron)}
        />
      )}

      {confirmingStatus && (
        <ConfirmStatusDialog
          patron={confirmingStatus}
          onClose={() => setConfirmingStatus(null)}
          onConfirm={handleToggleStatus}
        />
      )}
    </div>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsPageContent />
    </Suspense>
  )
}
