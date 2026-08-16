// Sprint 5.6 – Reports Screen
// Reports plan Phase 1 — real filterable backend replacing the old
// client-side derive* functions (moved to apps/api/core/reports.py).
// Chart components below keep their exact original prop shapes; only
// what feeds them changed.
"use client"

import { useEffect, useState } from "react"
import {
  BarChart2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  TrendingUp,
  Users,
  BookMarked,
  ArrowUpDown,
  Download,
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
import { fetchPatrons } from "@/lib/users"
import {
  fetchCatalogueReport,
  fetchCirculationSummary,
  fetchBorrowingTrends,
  fetchTopPatrons,
  fetchOverdueReport,
  fetchLibraryStats,
  fetchTransactionStats,
  fetchShelfList,
  resolveDateRange,
  downloadCsv,
  type Bucket,
  type CatalogueSlice,
  type TopPatron,
  type OverdueRow,
  type LibraryStats,
  type TransactionStats,
  type ShelfListRow,
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
import type { Book, UserProfile } from "@lasallia/types"

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportTab = "overview" | "overdue" | "weeding"
type SortDir = "asc" | "desc" | null
type SortKey = "patron" | "book" | "due" | "days" | "program" | null
type ShelfSortKey = "call_number" | "title" | "accession_number" | null

const YEAR_LEVEL_LABELS: Record<string, number> = {
  "1st Year": 1,
  "2nd Year": 2,
  "3rd Year": 3,
  "4th Year": 4,
}

// ─── Inline chart components — all data-driven via props, unchanged shapes ────
function DonutChart({ data }: { data: CatalogueSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = 58
  const cx = 80
  const cy = 80
  const c = 2 * Math.PI * r
  let offset = 0

  if (total === 0) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No books in the catalog yet.</p>
  }

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 160 160" style={{ width: 140, height: 140, flexShrink: 0 }}>
        {data.map((d, i) => {
          const dash = (d.value / total) * c
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={26}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
          offset += dash
          return el
        })}
        <circle cx={cx} cy={cy} r={45} fill="white" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={15} fontWeight="700" fill="#14150F">{total.toLocaleString()}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill="#6B6E63">Total Books</text>
      </svg>
      <ul className="flex flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {d.label}
            </span>
            <span className="text-ink-400 ml-auto pl-3" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
              {d.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BarChartViz({ data }: { data: Bucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex flex-col gap-2 w-full">
      <svg viewBox="0 0 270 110" className="w-full">
        {data.map((d, i) => {
          const bw = 28
          const gap = 42
          const x = i * gap + 8
          const bh = (d.value / max) * 76
          const y = 86 - bh
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} fill="#00874A" rx={3} opacity={0.85} />
              <rect x={x} y={y} width={bw} height={4} fill="#006F3C" rx={3} />
              <text x={x + bw / 2} y={100} textAnchor="middle" fontSize={8.5} fill="#6B6E63" fontFamily="var(--font-body)">{d.label}</text>
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize={8} fill="#14150F" fontWeight="600" fontFamily="var(--font-body)">{d.value}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LineChartViz({ data }: { data: Bucket[] }) {
  if (data.length === 0) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No activity in this range yet.</p>
  }
  const max = Math.max(1, ...data.map((d) => d.value))
  const W = 280; const H = 100; const padX = 12; const padY = 14
  const pts = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * (W - padX * 2),
    y: padY + ((max - d.value) / max) * (H - padY * 2),
    label: d.label,
    value: d.value,
  }))
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
  const area = `${path} L${pts[pts.length - 1].x},${H - padY} L${pts[0].x},${H - padY}Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00874A" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#00874A" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lg1)" />
      <path d={path} fill="none" stroke="#00874A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#00874A" strokeWidth={1.5} />
          {i % 2 === 0 && (
            <text x={p.x} y={H - 2} textAnchor="middle" fontSize={7.5} fill="#6B6E63" fontFamily="var(--font-body)">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
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
          <span
            className="text-ink-400 w-4 text-right shrink-0"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-ink-900 font-medium truncate"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {p.name}
              </span>
              <span
                className="text-ink-500 ml-2 shrink-0"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {p.count} books
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-600 transition-all"
                style={{ width: `${(p.count / max) * 100}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ─── New: filter-mismatch note for book-level reports ─────────────────────────
function FilterMismatchNote() {
  return (
    <p className="text-ink-400 italic mb-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
      Program/year level filters don&apos;t apply here — this is a book-level report, not a loan-level one.
    </p>
  )
}

// ─── New: Library Statistics + Transaction Statistics card content ────────────
function LibraryStatsCard({ stats, tx }: { stats: LibraryStats | null; tx: TransactionStats | null }) {
  if (!stats) {
    return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>Loading…</p>
  }
  const tiles = [
    { label: "Total Titles", value: stats.total_titles.toLocaleString() },
    { label: "Total Copies", value: stats.total_copies.toLocaleString() },
    { label: "Active Borrowers", value: stats.active_borrowers.toLocaleString() },
    { label: "Overdue", value: stats.overdue_count.toLocaleString() },
    { label: "Utilization", value: `${Math.round(stats.utilization_rate * 100)}%` },
    { label: "Top Category", value: stats.most_active_category ?? "—" },
  ]
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded bg-ink-50 px-2.5 py-2 min-w-0">
            <p className="text-ink-900 font-bold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}>{t.value}</p>
            <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>{t.label}</p>
          </div>
        ))}
      </div>
      {tx && (
        <div className="pt-2 border-t border-ink-100">
          <p
            className="text-ink-400 uppercase font-semibold mb-1.5"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
          >
            Transactions (period)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}>{tx.total_transactions}</p>
              <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>Total</p>
            </div>
            <div>
              <p className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}>{tx.loan_count}</p>
              <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>Loans</p>
            </div>
            <div>
              <p className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}>{tx.reservation_count}</p>
              <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>Reservations</p>
            </div>
          </div>
          {tx.average_loan_duration_days != null && (
            <p className="text-ink-500 mt-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              Avg. loan duration: {tx.average_loan_duration_days} day{tx.average_loan_duration_days === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── New: Shelf List card content — plain sortable table, not a chart ─────────
function ShelfListTable({ rows, onExport }: { rows: ShelfListRow[]; onExport: () => void }) {
  const [sortKey, setSortKey] = useState<ShelfSortKey>("call_number")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const handleSort = (key: ShelfSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"))
      if (sortDir === "desc") setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey || !sortDir) return 0
    const va = a[sortKey] ?? ""
    const vb = b[sortKey] ?? ""
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  const SortIcon = ({ k }: { k: ShelfSortKey }) => {
    if (sortKey !== k || !sortDir) return <ChevronsUpDown size={12} className="text-ink-300" />
    return sortDir === "asc" ? <ChevronUp size={12} className="text-green-600" /> : <ChevronDown size={12} className="text-green-600" />
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          {rows.length} {rows.length === 1 ? "copy" : "copies"}
        </p>
        <button
          onClick={onExport}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
        >
          <Download size={12} /> Export CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded border border-ink-200 bg-white py-8 flex items-center justify-center text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          No books match this filter.
        </div>
      ) : (
        <div className="rounded border border-ink-200 max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-ink-50">
              <tr className="border-b border-ink-200">
                {([
                  { label: "Call #", key: "call_number" as ShelfSortKey },
                  { label: "Title", key: "title" as ShelfSortKey },
                  { label: "Accession", key: "accession_number" as ShelfSortKey },
                  { label: "Status", key: null },
                ]).map((col) => (
                  <th
                    key={col.label}
                    className={cn("text-left py-2 px-3 text-ink-500 font-semibold select-none", col.key ? "cursor-pointer hover:text-ink-800" : "")}
                    onClick={() => col.key && handleSort(col.key)}
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                  >
                    <span className="flex items-center gap-1">{col.label}{col.key && <SortIcon k={col.key} />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.accession_number} className="border-b border-ink-100 hover:bg-ink-50">
                  <td className="py-2 px-3 text-ink-700 whitespace-nowrap" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>{row.call_number}</td>
                  <td className="py-2 px-3 text-ink-900 font-medium truncate max-w-40" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>{row.title}</td>
                  <td className="py-2 px-3 text-ink-500 whitespace-nowrap" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>{row.accession_number}</td>
                  <td className="py-2 px-3 text-ink-500 whitespace-nowrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      <div className="flex flex-col gap-3">
        <div>
          <h2
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
          >
            Weeding Candidates
          </h2>
          <p className="text-ink-400 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Flagged by a fixed rule — low or zero borrows over 2 years, and old. AI only explains the finding; you decide.
          </p>
        </div>

        {loading ? (
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>Loading…</p>
        ) : candidates.length === 0 ? (
          <div className="rounded border border-ink-200 bg-white py-8 flex items-center justify-center text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            No weeding candidates right now.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.map((c) => (
              <div
                key={c.book_id}
                className="rounded border border-ink-200 bg-white p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                style={{ boxShadow: "var(--shadow)" }}
              >
                <div className="min-w-0">
                  <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                    {c.title}
                  </p>
                  <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                    {c.author} · {c.category}{c.published_year ? ` · ${c.published_year}` : ""}
                  </p>
                  <p className="text-ink-600 mt-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    {c.reason}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleDismiss(c)}
                    disabled={busyId === c.book_id}
                    className="px-3 py-1.5 rounded border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40 transition-colors"
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
      <div className="flex flex-col gap-3">
        <h2
          className="text-ink-900 font-semibold"
          style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
        >
          Weeding Log
        </h2>
        {events.length === 0 ? (
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            No weeding actions recorded yet.
          </p>
        ) : (
          <div className="rounded border border-ink-200 bg-white overflow-x-auto" style={{ boxShadow: "var(--shadow)" }}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50">
                  {["Book", "Action", "By", "When", ""].map((label) => (
                    <th
                      key={label}
                      className="text-left py-2.5 px-4 text-ink-500 font-semibold"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
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
      </div>
    </div>
  )
}

// ─── Draggable report card ────────────────────────────────────────────────────
interface CardDef {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  content: React.ReactNode
}

function SortableCard({ card }: { card: CardDef }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={cn(
        "rounded border border-ink-200 bg-white flex flex-col transition-shadow",
        isDragging ? "shadow-xl opacity-90 ring-2 ring-green-400" : "hover:shadow-md"
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-ink-100">
        <div className="flex items-center gap-2.5">
          <span className="text-green-700">{card.icon}</span>
          <div>
            <p
              className="text-ink-900 font-semibold leading-tight"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {card.title}
            </p>
            <p
              className="text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {card.subtitle}
            </p>
          </div>
        </div>
        <button
          {...attributes}
          {...listeners}
          className="p-1.5 rounded cursor-grab active:cursor-grabbing text-ink-300 hover:text-ink-600 hover:bg-ink-100 transition-colors touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div className="px-4 py-4 flex-1 flex items-center justify-center">
        {card.content}
      </div>
    </div>
  )
}

// ─── Overdue table ────────────────────────────────────────────────────────────
function OverdueTable({ rows, onExport }: { rows: OverdueRow[]; onExport: () => void }) {
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"))
      if (sortDir === "desc") setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = [...rows].sort((a, b) => {
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

  const totalFine = sorted.reduce((s, b) => s + b.fine, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Overdue Books", value: `${rows.length}`, alert: true },
          { label: "Total Fines",   value: `₱${totalFine.toFixed(2)}`, alert: false },
          { label: "Patrons Affected", value: `${new Set(rows.map((r) => r.patronEmail)).size}`, alert: false },
          { label: "Avg Days Late",   value: rows.length ? `${Math.round(rows.reduce((s, b) => s + b.daysOverdue, 0) / rows.length)}d` : "—", alert: false },
        ].map((s) => (
          <div key={s.label} className="rounded border border-ink-200 bg-white px-4 py-3">
            <p
              className="text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {s.label}
            </p>
            <p
              className={cn("font-bold mt-0.5", s.alert ? "text-red-600" : "text-ink-900")}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xl)" }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p
          className="text-ink-500"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {sorted.length} overdue {sorted.length === 1 ? "book" : "books"} as of today
        </p>
        <button
          onClick={onExport}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="rounded border border-ink-200 bg-white py-10 flex items-center justify-center text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Nothing overdue right now.
        </div>
      ) : (
        <div className="rounded border border-ink-200 bg-white overflow-x-auto" style={{ boxShadow: "var(--shadow)" }}>
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
                      "text-left py-2.5 px-4 text-ink-500 font-semibold select-none",
                      col.key ? "cursor-pointer hover:text-ink-800 group" : ""
                    )}
                    onClick={() => col.key && handleSort(col.key)}
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "var(--text-2xs)",
                      letterSpacing: "var(--tracking-micro)",
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
              {sorted.map((row) => (
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
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("overview")

  // Only used to populate the Category/Program filter dropdown option
  // lists — the reports themselves come from the backend now.
  const [books, setBooks] = useState<Book[]>([])
  const [patrons, setPatrons] = useState<UserProfile[]>([])

  useEffect(() => {
    Promise.all([fetchBooks(), fetchPatrons()])
      .then(([b, p]) => { setBooks(b); setPatrons(p) })
      .catch(() => {})
  }, [])

  // Filter state – Sprint 5.6.2, now actually wired (Reports plan Phase 1)
  const [dateRange, setDateRange]   = useState<DateRangePreset>("month")
  const [fromDate, setFromDate]     = useState("")
  const [toDate, setToDate]         = useState("")
  const [category, setCategory]     = useState("All Categories")
  const [program, setProgram]       = useState("All Programs")
  const [yearLevel, setYearLevel]   = useState("All Year Levels")

  const [loading, setLoading] = useState(true)
  const [catalogueData, setCatalogueData] = useState<CatalogueSlice[]>([])
  const [circulationData, setCirculationData] = useState<Bucket[]>([])
  const [trendData, setTrendData] = useState<Bucket[]>([])
  const [topPatronsData, setTopPatronsData] = useState<TopPatron[]>([])
  const [overdueRowsData, setOverdueRowsData] = useState<OverdueRow[]>([])
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null)
  const [transactionStats, setTransactionStats] = useState<TransactionStats | null>(null)
  const [shelfListData, setShelfListData] = useState<ShelfListRow[]>([])

  useEffect(() => {
    const { dateFrom, dateTo } = resolveDateRange(dateRange, fromDate, toDate)
    const filters: ReportFilters = {
      dateFrom,
      dateTo,
      category: category === "All Categories" ? undefined : category,
      program: program === "All Programs" ? undefined : program,
      yearLevel: YEAR_LEVEL_LABELS[yearLevel],
    }
    setLoading(true)
    Promise.all([
      fetchCatalogueReport(filters),
      fetchCirculationSummary(filters),
      fetchBorrowingTrends(filters),
      fetchTopPatrons(filters),
      fetchOverdueReport(filters),
      fetchLibraryStats(filters),
      fetchTransactionStats(filters),
      fetchShelfList(filters),
    ])
      .then(([cat, circ, trend, topP, overdue, libStats, txStats, shelf]) => {
        setCatalogueData(cat)
        setCirculationData(circ)
        setTrendData(trend)
        setTopPatronsData(topP)
        setOverdueRowsData(overdue)
        setLibraryStats(libStats)
        setTransactionStats(txStats)
        setShelfListData(shelf)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dateRange, fromDate, toDate, category, program, yearLevel])

  const exportShelfListCsv = () => downloadCsv("shelf-list.csv", shelfListData.map((r) => ({
    accession_number: r.accession_number,
    call_number: r.call_number,
    title: r.title,
    author: r.author,
    category: r.category,
    shelf_location: r.shelf_location ?? "",
    status: r.status,
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

  const showBookLevelNote = program !== "All Programs" || yearLevel !== "All Year Levels"

  const quickStats = [
    { label: "Total Titles",     value: (libraryStats?.total_titles ?? 0).toLocaleString(), icon: <BookMarked size={18} />, color: "text-green-700", bg: "bg-green-50" },
    { label: "Books Circulated", value: (transactionStats?.loan_count ?? 0).toLocaleString(), icon: <TrendingUp size={18} />,  color: "text-blue-700",  bg: "bg-blue-50"  },
    { label: "Active Borrowers", value: (libraryStats?.active_borrowers ?? 0).toLocaleString(), icon: <Users size={18} />,     color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Overdue Books",    value: overdueRowsData.length.toLocaleString(), icon: <AlertTriangle size={18} />, color: "text-red-700", bg: "bg-red-50" },
  ]

  // DnD card order – Sprint 5.6.1, extended with Reports plan Phase 1's two new cards
  const cardDefs: CardDef[] = [
    {
      id: "catalogue",
      title: "Catalogue Overview",
      subtitle: "Collection by category",
      icon: <BookMarked size={16} />,
      content: <DonutChart data={catalogueData} />,
    },
    {
      id: "circulation",
      title: "Circulation Summary",
      subtitle: "Monthly borrows (last 6 months)",
      icon: <BarChart2 size={16} />,
      content: <BarChartViz data={circulationData} />,
    },
    {
      id: "patrons",
      title: "Top Patrons",
      subtitle: "Highest borrowers in range",
      icon: <Users size={16} />,
      content: <TopPatronsList patrons={topPatronsData} />,
    },
    {
      id: "trends",
      title: "Borrowing Trends",
      subtitle: "Weekly activity (last 8 weeks)",
      icon: <TrendingUp size={16} />,
      content: <LineChartViz data={trendData} />,
    },
    {
      id: "library-stats",
      title: "Library Statistics",
      subtitle: "Snapshot + transactions in range",
      icon: <BookMarked size={16} />,
      content: <LibraryStatsCard stats={libraryStats} tx={transactionStats} />,
    },
    {
      id: "shelf-list",
      title: "Shelf List",
      subtitle: "Physical copies, call-number order",
      icon: <BarChart2 size={16} />,
      content: (
        <div className="flex flex-col gap-1 w-full">
          {showBookLevelNote && <FilterMismatchNote />}
          <ShelfListTable rows={shelfListData} onExport={exportShelfListCsv} />
        </div>
      ),
    },
  ]

  const [cardOrder, setCardOrder] = useState<string[]>(["catalogue", "circulation", "patrons", "trends", "library-stats", "shelf-list"])
  const cards = cardOrder.map((id) => cardDefs.find((c) => c.id === id)!).filter(Boolean)

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

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-6">
      {/* ── Page header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
          >
            Reports
          </h1>
          <p
            className="text-ink-400 mt-0.5"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {today}{loading ? " · Loading…" : ""}
          </p>
        </div>
      </div>

      {/* ── Filter bar – Sprint 5.6.2 ─────────────────────── */}
      <div className="rounded border border-ink-200 bg-white p-4 flex flex-wrap items-end gap-3" style={{ boxShadow: "var(--shadow)" }}>
        {/* Date range quick select */}
        <div className="flex flex-col gap-1">
          <label
            className="text-ink-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            Date Range
          </label>
          <div className="flex items-center gap-1 p-0.5 rounded bg-ink-100">
            {(["week", "month", "semester", "custom"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={cn(
                  "px-3 py-1.5 rounded capitalize transition-colors",
                  dateRange === r ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
                )}
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {r === "week" ? "This Week" : r === "month" ? "This Month" : r === "semester" ? "Semester" : "Custom"}
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
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-ink-200">
        {([
          { key: "overview", label: "Overview" },
          { key: "overdue",  label: "Overdue Books" },
          { key: "weeding",  label: "Weeding" },
        ] as { key: ReportTab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-5 py-2.5 font-semibold border-b-2 transition-colors -mb-px",
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

          {/* DnD chart grid */}
          <div>
            <p
              className="text-ink-400 mb-3 flex items-center gap-1.5"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              <GripVertical size={12} />
              Drag cards to rearrange the dashboard
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {cards.map((card) => (
                    <SortableCard key={card.id} card={card} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

      {/* ── Overdue Books tab – Sprint 5.6.4 ──────────────── */}
      {tab === "overdue" && <OverdueTable rows={overdueRowsData} onExport={exportOverdueCsv} />}

      {/* ── Weeding tab – Reports plan Phase 2 ────────────── */}
      {tab === "weeding" && <WeedingPanel />}
    </div>
  )
}
