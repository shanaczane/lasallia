// The Patrons page: the patron list, profiles and account actions.

"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, AlertCircle, Users, GraduationCap, BookUser, Clock, Wallet } from "lucide-react"
import type { UserProfile } from "@lasallia/types"
import { fetchPatrons, updatePatronStatus } from "@/lib/users"
import { fetchLoans, type Loan } from "@/lib/kiosk"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { cn } from "@/lib/utils"
import { getUser } from "@/lib/auth"
import { downloadCsv } from "@/lib/reports"
import { ROLE_LABEL } from "@/lib/mock/patrons"
import { Pagination } from "@/components/ui/catalog"
import {
  PatronsToolbar,
  type StatusFilter,
} from "@/components/ui/patrons/PatronsToolbar"
import { PatronsTable, EMPTY_STATS, type PatronStats } from "@/components/ui/patrons/PatronsTable"
import { PatronProfileModal } from "@/components/ui/patrons/PatronProfileModal"
import { ConfirmStatusDialog } from "@/components/ui/patrons/ConfirmStatusDialog"

const PAGE_SIZE = 8

// ─── Pagination hook + Paginator ─────────────────────────────────────────────

function usePagination<T>(items: T[], resetKey?: unknown) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)
  const start = (clampedPage - 1) * PAGE_SIZE
  const pageItems = items.slice(start, start + PAGE_SIZE)

  function goTo(n: number) {
    setPage(Math.max(1, Math.min(n, totalPages)))
  }

  const [lastKey, setLastKey] = useState(resetKey)
  if (resetKey !== undefined && lastKey !== resetKey) {
    setLastKey(resetKey)
    setPage(1)
  }

  return { page: clampedPage, totalPages, pageItems, goTo }
}

// A count on the left and the page buttons on the right.
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
  const end = Math.min(page * PAGE_SIZE, totalItems)

  return (
    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
        Showing <span className="font-medium text-ink-600">{start}–{end}</span> of{" "}
        <span className="font-medium text-ink-600">{totalItems}</span>
      </p>
      <Pagination page={page} totalPages={totalPages} onChange={goTo} />
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, variant }: { message: string; variant: "success" | "error" }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-full shadow-(--shadow-lg) pointer-events-none max-w-[90vw]">
      {variant === "success" ? (
        <CheckCircle2 size={15} className="text-green-400 shrink-0" />
      ) : (
        <AlertCircle size={15} className="text-danger shrink-0" />
      )}
      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
        {message}
      </span>
    </div>
  )
}

// ─── Summary cards ───────────────────────────────────────────────────────────
// Each one doubles as a filter: clicking it narrows the list to those patrons,
// clicking it again (or "Total patrons") clears that filter.

type QuickFilter = "all" | "students" | "faculty" | "overdue" | "fines"

function SummaryCard({
  icon, iconClass, label, value, active, onClick,
}: {
  icon: React.ReactNode
  iconClass: string
  label: string
  value: number | string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-w-0 flex items-center gap-3 rounded-(--radius) border bg-white px-4 py-3 text-left transition-colors",
        active ? "border-green-700 ring-1 ring-green-700" : "border-ink-200 hover:border-ink-300",
      )}
    >
      <span className={cn("flex items-center justify-center w-9 h-9 rounded-sm shrink-0", iconClass)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-ink-900 font-bold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
          {value}
        </span>
        <span className="block text-ink-500 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
          {label}
        </span>
      </span>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PatronsPageContent() {
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("highlight")

  const [patrons, setPatrons] = useState<UserProfile[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPatrons()
      .then(setPatrons)
      .catch(() => {})
      .finally(() => setLoading(false))
    // Loaded separately, so a loans error doesn't hide the patron list.
    fetchLoans().then(setLoans).catch(() => {})
  }, [])

  // Books out, overdue and fines owed per patron. "Owed" matches the
  // profile's Outstanding total.
  const stats = useMemo(() => {
    const byPatron: Record<string, PatronStats> = {}
    for (const l of loans) {
      const s = (byPatron[l.student_id] ??= { ...EMPTY_STATS })
      if (l.status === "active" || l.status === "overdue") {
        s.booksOut += 1
        if (l.status === "overdue") s.overdue += 1
        s.owed += l.preview_fine_amount ?? 0
      } else if (l.fine_status === "unsettled") {
        s.owed += l.fine_amount ?? 0
      }
    }
    return byPatron
  }, [loans])
  const statsOf = (p: UserProfile) => stats[p.id] ?? EMPTY_STATS

  const [query, setQuery] = useState("")
  const [collegeFilter, setCollegeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")

  const [viewing, setViewing] = useState<UserProfile | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<UserProfile | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null)

  // The signed-in librarian, who can't deactivate themselves.
  const [selfId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getUser()?.id ?? null
  )

  function showToast(message: string, variant: "success" | "error") {
    setToast({ message, variant })
    setTimeout(() => setToast(null), 3000)
  }

  // A link from elsewhere can open a patron's profile directly.
  useEffect(() => {
    if (!highlightId || patrons.length === 0) return
    const match = patrons.find((p) => p.id === highlightId)
    if (match) setViewing(match)
  }, [highlightId, patrons])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patrons.filter((p) => {
      const matchesQuery =
        !q ||
        (p.full_name ?? "").toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.program ?? "").toLowerCase().includes(q) ||
        (p.id_number ?? "").toLowerCase().includes(q)
      const matchesCollege = collegeFilter === "all" || (p.college || collegeForProgram(p.program)) === collegeFilter
      const matchesStatus = statusFilter === "all" || (p.status ?? "active") === statusFilter
      const s = stats[p.id] ?? EMPTY_STATS
      const matchesQuick =
        quickFilter === "all" ||
        (quickFilter === "students" && p.role === "student") ||
        (quickFilter === "faculty" && p.role === "faculty") ||
        (quickFilter === "overdue" && s.overdue > 0) ||
        (quickFilter === "fines" && s.owed > 0)
      return matchesQuery && matchesCollege && matchesStatus && matchesQuick
    })
  }, [patrons, stats, query, collegeFilter, statusFilter, quickFilter])

  const { page, totalPages, pageItems, goTo } = usePagination(
    filtered,
    `${query}|${collegeFilter}|${statusFilter}|${quickFilter}`,
  )

  const summary = {
    total: patrons.length,
    students: patrons.filter((p) => p.role === "student").length,
    faculty: patrons.filter((p) => p.role === "faculty").length,
    overdue: patrons.filter((p) => statsOf(p).overdue > 0).length,
    fines: patrons.filter((p) => statsOf(p).owed > 0).length,
  }
  const toggleQuick = (f: QuickFilter) => setQuickFilter((cur) => (cur === f ? "all" : f))

  // Exports the filtered list (all pages), matching what's on screen.
  const exportPatronsCsv = () => downloadCsv("patrons.csv", filtered.map((p) => ({
    name: p.full_name ?? "",
    email: p.email,
    id_number: p.id_number ?? "",
    role: ROLE_LABEL[p.role],
    college: p.college || collegeForProgram(p.program) || "",
    program: p.program ?? "",
    year_level: p.year_level ?? "",
    books_out: statsOf(p).booksOut,
    overdue: statsOf(p).overdue,
    fines_owed: statsOf(p).owed.toFixed(2),
    status: p.status ?? "active",
    joined: p.created_at,
  })))

  async function handleToggleStatus(userId: string) {
    const current = patrons.find((p) => p.id === userId)
    const nextStatus = current?.status === "inactive" ? "active" : "inactive"

    setPatrons((prev) => prev.map((p) => (p.id === userId ? { ...p, status: nextStatus } : p)))
    setConfirmingStatus(null)
    setViewing((v) => (v && v.id === userId ? { ...v, status: nextStatus } : v))

    try {
      await updatePatronStatus(userId, nextStatus)
      showToast(
        `${current?.full_name ?? "Patron"} ${nextStatus === "inactive" ? "deactivated" : "activated"}.`,
        "success"
      )
    } catch (err) {
      // Undo if it failed (e.g. the patron still has a book out).
      setPatrons((prev) => prev.map((p) => (p.id === userId ? { ...p, status: current?.status } : p)))
      setViewing((v) => (v && v.id === userId ? { ...v, status: current?.status } : v))
      showToast(err instanceof Error ? err.message : "Could not update this patron.", "error")
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-(--max-w-content) mx-auto flex flex-col gap-5">
      <div>
        <h1
          className="text-ink-900 font-semibold"
          style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
        >
          Patrons
        </h1>
        <p className="text-ink-400 mt-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
          View and manage registered students, faculty, and staff accounts.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard
          icon={<Users size={18} />} iconClass="bg-green-100 text-green-700"
          label="Total patrons" value={summary.total}
          active={quickFilter === "all"} onClick={() => setQuickFilter("all")}
        />
        <SummaryCard
          icon={<GraduationCap size={18} />} iconClass="bg-info-bg text-info"
          label="Students" value={summary.students}
          active={quickFilter === "students"} onClick={() => toggleQuick("students")}
        />
        <SummaryCard
          icon={<BookUser size={18} />} iconClass="bg-gold-100 text-gold-600"
          label="Faculty" value={summary.faculty}
          active={quickFilter === "faculty"} onClick={() => toggleQuick("faculty")}
        />
        <SummaryCard
          icon={<Clock size={18} />} iconClass="bg-danger-bg text-danger"
          label="With overdue books" value={summary.overdue}
          active={quickFilter === "overdue"} onClick={() => toggleQuick("overdue")}
        />
        <SummaryCard
          icon={<Wallet size={18} />} iconClass="bg-warn-bg text-warn"
          label="With unpaid fines" value={summary.fines}
          active={quickFilter === "fines"} onClick={() => toggleQuick("fines")}
        />
      </div>

      <PatronsToolbar
        query={query}
        onQueryChange={setQuery}
        collegeFilter={collegeFilter}
        onCollegeFilterChange={setCollegeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        resultCount={filtered.length}
        onExport={exportPatronsCsv}
        exportDisabled={filtered.length === 0}
      />

      <PatronsTable
        patrons={pageItems}
        stats={stats}
        onView={setViewing}
        onToggleStatus={setConfirmingStatus}
        selfId={selfId}
      />

      <Paginator page={page} totalPages={totalPages} goTo={goTo} totalItems={filtered.length} />

      {viewing && (
        <PatronProfileModal
          patron={viewing}
          onClose={() => setViewing(null)}
          onToggleStatus={() => setConfirmingStatus(viewing)}
          isSelf={viewing.id === selfId}
        />
      )}

      {confirmingStatus && (
        <ConfirmStatusDialog
          patron={confirmingStatus}
          onClose={() => setConfirmingStatus(null)}
          onConfirm={handleToggleStatus}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </div>
  )
}

export default function PatronsPage() {
  return (
    <Suspense fallback={null}>
      <PatronsPageContent />
    </Suspense>
  )
}