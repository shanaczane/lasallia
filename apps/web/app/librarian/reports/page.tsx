// Sprint 5.6 – Reports Screen
"use client"

import { useEffect, useMemo, useState } from "react"
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
import { fetchLoans, type Loan } from "@/lib/kiosk"
import { fetchPatrons } from "@/lib/users"
import type { Book, UserProfile } from "@lasallia/types"

// ─── Types ────────────────────────────────────────────────────────────────────
type ReportTab = "overview" | "overdue"
type SortDir = "asc" | "desc" | null
type SortKey = "patron" | "book" | "due" | "days" | "program" | null
type Bucket = { label: string; value: number }
type CatalogueSlice = { label: string; value: number; color: string }
type TopPatron = { id: string; name: string; program: string; count: number }
type OverdueRow = {
  id: string
  patron: string
  patronEmail: string
  program: string
  year: string
  book: string
  author: string
  dueDate: string
  daysOverdue: number
  fine: number
}

const CATALOGUE_COLORS = ["#006F3C", "#00874A", "#B8923D", "#4A6FA5", "#8B5CF6", "#DDDFD7"]

// ─── Derivation from real data ─────────────────────────────────────────────────

function deriveCatalogue(books: Book[]): CatalogueSlice[] {
  const byCategory = new Map<string, number>()
  for (const b of books) {
    const key = b.category || "Uncategorized"
    byCategory.set(key, (byCategory.get(key) ?? 0) + (b.total_copies ?? 1))
  }
  return [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: CATALOGUE_COLORS[i % CATALOGUE_COLORS.length] }))
}

function deriveMonthlyCirculation(loans: Loan[], months = 6): Bucket[] {
  const now = new Date()
  const buckets: Bucket[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ label: d.toLocaleDateString("en-US", { month: "short" }), value: 0 })
  }
  for (const loan of loans) {
    const d = new Date(loan.borrowed_at)
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    if (monthsAgo >= 0 && monthsAgo < months) {
      buckets[months - 1 - monthsAgo].value += 1
    }
  }
  return buckets
}

function deriveWeeklyTrend(loans: Loan[], weeks = 8): Bucket[] {
  const now = new Date()
  const startOfThisWeek = new Date(now)
  startOfThisWeek.setDate(now.getDate() - now.getDay())
  startOfThisWeek.setHours(0, 0, 0, 0)

  const buckets: Bucket[] = []
  const starts: Date[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(startOfThisWeek)
    start.setDate(start.getDate() - i * 7)
    starts.push(start)
    buckets.push({ label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: 0 })
  }
  for (const loan of loans) {
    const d = new Date(loan.borrowed_at)
    for (let i = starts.length - 1; i >= 0; i--) {
      if (d >= starts[i]) {
        buckets[i].value += 1
        break
      }
    }
  }
  return buckets
}

function deriveTopPatrons(loans: Loan[], patrons: UserProfile[], limit = 5): TopPatron[] {
  const patronsById = new Map(patrons.map((p) => [p.id, p]))
  const counts = new Map<string, number>()
  for (const loan of loans) {
    counts.set(loan.student_id, (counts.get(loan.student_id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: patronsById.get(id)?.full_name ?? "Unknown patron",
      program: patronsById.get(id)?.program ?? "—",
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function deriveOverdueRows(loans: Loan[], patrons: UserProfile[]): OverdueRow[] {
  const patronsById = new Map(patrons.map((p) => [p.id, p]))
  return loans
    .filter((l) => l.status === "overdue")
    .map((l) => {
      const patron = patronsById.get(l.student_id)
      return {
        id: l.id,
        patron: patron?.full_name ?? l.profiles?.full_name ?? "Unknown patron",
        patronEmail: patron?.email ?? "—",
        program: patron?.program ?? "—",
        year: patron?.year_level ? `${patron.year_level}${yearSuffix(patron.year_level)} Year` : "—",
        book: l.books?.title ?? "Unknown title",
        author: l.books?.author ?? "—",
        dueDate: l.due_date,
        daysOverdue: l.days_overdue ?? 0,
        fine: l.preview_fine_amount ?? 0,
      }
    })
}

function yearSuffix(n: number): string {
  if (n === 1) return "st"
  if (n === 2) return "nd"
  if (n === 3) return "rd"
  return "th"
}

// ─── Inline chart components — all data-driven via props now ──────────────────
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
function OverdueTable({ rows }: { rows: OverdueRow[] }) {
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

      <p
        className="text-ink-500"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        {sorted.length} overdue {sorted.length === 1 ? "book" : "books"} as of today
      </p>

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
  const [books, setBooks] = useState<Book[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [patrons, setPatrons] = useState<UserProfile[]>([])

  useEffect(() => {
    Promise.all([fetchBooks(), fetchLoans(), fetchPatrons()])
      .then(([b, l, p]) => { setBooks(b); setLoans(l); setPatrons(p) })
      .catch(() => {})
  }, [])

  // Filter state – Sprint 5.6.2 (not yet wired to the data below — these
  // controls were inert placeholders before this pass too; leaving them as
  // UI-only rather than half-wiring a filter that only touches some charts)
  const [dateRange, setDateRange]   = useState<"week" | "month" | "semester" | "custom">("month")
  const [fromDate, setFromDate]     = useState("")
  const [toDate, setToDate]         = useState("")
  const [category, setCategory]     = useState("All Categories")
  const [program, setProgram]       = useState("All Programs")
  const [yearLevel, setYearLevel]   = useState("All Year Levels")

  const catalogueData = useMemo(() => deriveCatalogue(books), [books])
  const circulationData = useMemo(() => deriveMonthlyCirculation(loans), [loans])
  const trendData = useMemo(() => deriveWeeklyTrend(loans), [loans])
  const topPatrons = useMemo(() => deriveTopPatrons(loans, patrons), [loans, patrons])
  const overdueRows = useMemo(() => deriveOverdueRows(loans, patrons), [loans, patrons])

  const activeBorrowers = useMemo(
    () => new Set(loans.filter((l) => l.status !== "returned").map((l) => l.student_id)).size,
    [loans]
  )

  const quickStats = [
    { label: "Total Titles",     value: books.length.toLocaleString(), icon: <BookMarked size={18} />, color: "text-green-700", bg: "bg-green-50" },
    { label: "Books Circulated", value: loans.length.toLocaleString(), icon: <TrendingUp size={18} />,  color: "text-blue-700",  bg: "bg-blue-50"  },
    { label: "Active Borrowers", value: activeBorrowers.toLocaleString(), icon: <Users size={18} />,     color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Overdue Books",    value: overdueRows.length.toLocaleString(), icon: <AlertTriangle size={18} />, color: "text-red-700", bg: "bg-red-50" },
  ]

  // DnD card order – Sprint 5.6.1
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
      subtitle: "Highest borrowers all-time",
      icon: <Users size={16} />,
      content: <TopPatronsList patrons={topPatrons} />,
    },
    {
      id: "trends",
      title: "Borrowing Trends",
      subtitle: "Weekly activity (last 8 weeks)",
      icon: <TrendingUp size={16} />,
      content: <LineChartViz data={trendData} />,
    },
  ]

  const [cardOrder, setCardOrder] = useState<string[]>(["catalogue", "circulation", "patrons", "trends"])
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
            {today}
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
            {t.key === "overdue" && overdueRows.length > 0 && (
              <span
                className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {overdueRows.length}
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
      {tab === "overdue" && <OverdueTable rows={overdueRows} />}
    </div>
  )
}
