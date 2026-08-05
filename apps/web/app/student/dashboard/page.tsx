// apps/web/app/student/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Clock,
  Bookmark,
  Sparkles,
  Search,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getUser } from "@/lib/auth"
import { fetchLoans, type Loan as ApiLoan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import type { Reservation } from "@lasallia/types"

type BorrowStatus = "due_soon" | "overdue" | "active"

const STATUS_CONFIG: Record<BorrowStatus, { label: string; dot: string; text: string }> = {
  due_soon: { label: "Due Soon", dot: "bg-warn", text: "text-warn" },
  overdue:  { label: "Overdue",  dot: "bg-danger", text: "text-danger" },
  active:   { label: "Active",   dot: "bg-success", text: "text-success" },
}

// Matches apps/web/app/student/library/page.tsx — pending real LRC borrow-limit policy
const BORROW_LIMIT_PLACEHOLDER = 3
const DUE_SOON_DAYS = 3

function deriveStatus(loan: ApiLoan): BorrowStatus {
  if (loan.status === "overdue") return "overdue"
  const daysLeft = (new Date(loan.due_date).getTime() - Date.now()) / 86_400_000
  return daysLeft <= DUE_SOON_DAYS ? "due_soon" : "active"
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

type FilterKey = "all" | BorrowStatus

export default function StudentDashboard() {
  const [filter, setFilter] = useState<FilterKey>("all")
  const [loans, setLoans] = useState<ApiLoan[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState("there")

  useEffect(() => {
    Promise.all([fetchLoans(), fetchReservations()])
      .then(([l, r]) => { setLoans(l); setReservations(r) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // getUser() reads localStorage, which doesn't exist during Next's SSR
  // pass of this client component — has to run post-hydration, in an
  // effect, not directly in the render body.
  useEffect(() => {
    setFirstName(getUser()?.full_name?.split(" ")[0] ?? "there")
  }, [])

  const activeLoans = loans
    .filter((l) => l.status !== "returned")
    .map((loan) => ({ loan, status: deriveStatus(loan) }))

  const dueSoonCount = activeLoans.filter((x) => x.status === "due_soon").length
  const overdueCount = activeLoans.filter((x) => x.status === "overdue").length
  const activeCount = activeLoans.filter((x) => x.status === "active").length

  const nextDue = [...activeLoans]
    .filter((x) => x.status !== "overdue")
    .sort((a, b) => new Date(a.loan.due_date).getTime() - new Date(b.loan.due_date).getTime())[0]

  const activeReservations = reservations.filter((r) => r.status === "pending" || r.status === "ready")
  const readyForPickup = reservations.filter((r) => r.status === "ready").length

  const filteredLoans =
    filter === "all" ? activeLoans : activeLoans.filter((x) => x.status === filter)

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: activeLoans.length },
    { key: "due_soon", label: "Due Soon", count: dueSoonCount },
    { key: "overdue", label: "Overdue", count: overdueCount },
    { key: "active", label: "Active", count: activeCount },
  ]

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-6">

      {/* Greeting + Find a book */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1
            className="text-ink-900 font-semibold leading-tight"
            style={{ fontSize: "var(--text-4xl)", fontFamily: "var(--font-display)" }}
          >
            {greeting()}, <span className="italic text-green-700">{firstName}</span>.
          </h1>
          <p
            className="text-ink-500 mt-1"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            {loading
              ? "Loading your library…"
              : activeLoans.length === 0
                ? "You have no books out right now."
                : `You have ${activeLoans.length} book${activeLoans.length === 1 ? "" : "s"} out${
                    dueSoonCount + overdueCount > 0 ? `, ${dueSoonCount + overdueCount} due soon or overdue` : ""
                  }.`}
          </p>
        </div>

        <Link
          href="/student/catalog"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors shadow-sm self-start"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          <Search size={15} />
          Find a book
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:flex gap-3 sm:gap-4 sm:flex-wrap">
        <StatCard
          icon={<BookOpen size={18} className="text-green-700" />}
          iconBg="bg-green-100"
          label="Borrowed"
          value={String(activeLoans.length)}
          sub={`Borrowing limit: ${BORROW_LIMIT_PLACEHOLDER} books`}
        />
        <StatCard
          icon={<Clock size={18} className="text-warn" />}
          iconBg="bg-warn-bg"
          label="Due Soon"
          value={String(dueSoonCount)}
          sub={nextDue ? `"${nextDue.loan.books?.title ?? "Untitled"}" — ${formatShortDate(nextDue.loan.due_date)}` : "Nothing due soon"}
        />
        <StatCard
          icon={<AlertTriangle size={18} className="text-danger" />}
          iconBg="bg-danger-bg"
          label="Overdue"
          value={String(overdueCount)}
          sub={overdueCount > 0 ? "Please return as soon as possible" : "You're all caught up"}
        />
        <StatCard
          icon={<Bookmark size={18} className="text-gold-600" />}
          iconBg="bg-gold-100"
          label="Active Reservations"
          value={String(activeReservations.length)}
          sub={readyForPickup > 0 ? `${readyForPickup} ready for pickup` : "None ready yet"}
        />
      </div>

      {/* Main content: borrowed list + recommendations */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Currently Borrowed */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Title row */}
          <div className="flex items-center">
            <h2
              className="text-ink-900 font-semibold"
              style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
            >
              Currently Borrowed
            </h2>
          </div>

          {/* Filter pills + See all on same row */}
          <div className="flex items-end gap-2">
            <div className="flex gap-2 overflow-x-auto flex-1">
              {filters.map((f) => {
                const isActive = filter === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-pill border whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-green-700 border-green-700 text-white font-medium"
                        : "bg-white border-ink-200 text-ink-700 hover:bg-ink-50"
                    )}
                    style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "flex items-center justify-center rounded-full min-w-5 h-5 px-1 font-semibold",
                        isActive ? "bg-white/20 text-white" : "bg-ink-100 text-ink-500"
                      )}
                      style={{ fontSize: "var(--text-2xs)" }}
                    >
                      {f.count}
                    </span>
                  </button>
                )
              })}
            </div>
            <Link
              href="/student/library"
              className="text-green-700 font-medium hover:underline whitespace-nowrap shrink-0"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              See all →
            </Link>
          </div>

          {/* Borrowed books — table on desktop, cards on mobile */}
          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">

            {!loading && filteredLoans.length === 0 && (
              <div
                className="flex items-center justify-center py-10 text-ink-400"
                style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
              >
                No books to show.
              </div>
            )}

            {filteredLoans.length > 0 && (
              <>
                {/* Desktop table header */}
                <div
                  className="hidden sm:flex px-4 py-2.5 border-b border-ink-100 text-ink-400 uppercase font-semibold"
                  style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
                >
                  <span className="flex-1">Book</span>
                  <span className="w-24">Borrowed</span>
                  <span className="w-24">Due Date</span>
                  <span className="w-24">Status</span>
                </div>

                <div className="flex flex-col divide-y divide-ink-100">
                  {filteredLoans.map(({ loan, status }) => {
                    const cfg = STATUS_CONFIG[status]
                    return (
                      <Link
                        key={loan.id}
                        href={loan.books ? `/student/catalog/${loan.books.id}` : "/student/library"}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 px-4 py-3 hover:bg-ink-50 transition-colors"
                      >

                        {/* Book info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-ink-900 font-semibold truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                            {loan.books?.title ?? "Unknown title"}
                          </p>
                          <p className="text-ink-500 truncate" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            {loan.books?.author}
                          </p>
                        </div>

                        {/* Mobile: dates + status inline */}
                        <div className="flex sm:hidden items-center gap-3 text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                          <span>Borrowed {formatShortDate(loan.borrowed_at)}</span>
                          <span className={cn("font-medium", cfg.text)}>Due {formatShortDate(loan.due_date)}</span>
                        </div>

                        {/* Desktop columns */}
                        <span className="hidden sm:block w-24 text-ink-500" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                          {formatShortDate(loan.borrowed_at)}
                        </span>
                        <span className={cn("hidden sm:block w-24 font-medium", cfg.text)} style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                          {formatShortDate(loan.due_date)}
                        </span>

                        <span className="flex items-center gap-1.5 sm:w-24">
                          <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                          <span className={cn("font-medium", cfg.text)} style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            {cfg.label}
                          </span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Picked for You — recommendation engine not built yet */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <h2
            className="text-ink-900 font-semibold"
            style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
          >
            Picked for You
          </h2>

          <div className="bg-white rounded-(--radius) border border-ink-200 p-6 flex flex-col items-center text-center gap-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
              <Sparkles size={18} className="text-green-700" />
            </div>
            <p className="text-ink-700 font-semibold" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
              Recommendations coming soon
            </p>
            <p className="text-ink-400" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
              We&apos;re building a personalized recommendation engine based on your borrowing history.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="min-w-0 sm:flex-1 sm:min-w-50 bg-white rounded-(--radius) border border-ink-200 p-3 sm:p-4 flex flex-col gap-2 sm:gap-3">
      <div className={cn("flex items-center justify-center rounded-sm w-7 h-7 sm:w-9 sm:h-9", iconBg)}>
        {icon}
      </div>
      <div>
        <p
          className="text-ink-400 uppercase font-semibold truncate"
          style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
        >
          {label}
        </p>
        <p
          className="text-ink-900 font-bold leading-tight"
          style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-display)" }}
        >
          {value}
        </p>
        <p className="text-ink-500 mt-0.5 truncate" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
          {sub}
        </p>
      </div>
    </div>
  )
}
