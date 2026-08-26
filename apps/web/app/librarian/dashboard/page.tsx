// apps/web/app/librarian/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Users,
  Bookmark,
  AlertCircle,
  Plus,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchLoans, type Loan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import { fetchBooks } from "@/lib/books"
import { buildFeed, timeLabel, TX_CONFIG } from "@/lib/activity"
import type { Reservation } from "@lasallia/types"

// Dashboard only ever shows a short preview — the full, searchable history
// lives on the Reports "Activity Log" tab (see "See all" link below).
const ACTIVITY_PREVIEW_COUNT = 6

const OVERDUE_FLAG_DAYS = 7

export default function LibrarianDashboard() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [totalCopies, setTotalCopies] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchLoans(), fetchReservations(), fetchBooks()])
      .then(([l, r, books]) => {
        setLoans(l)
        setReservations(r)
        setTotalCopies(books.reduce((sum, b) => sum + (b.total_copies ?? 0), 0))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

  const activeLoans = loans.filter((l) => l.status !== "returned")
  const overdueLoans = loans.filter((l) => l.status === "overdue")
  const activeBorrowers = new Set(activeLoans.map((l) => l.student_id)).size
  const deepOverdue = overdueLoans.filter(
    (l) => (Date.now() - new Date(l.due_date).getTime()) / 86_400_000 > OVERDUE_FLAG_DAYS
  ).length

  const pendingReservations = reservations.filter((r) => r.status === "pending").length
  const readyReservations = reservations.filter((r) => r.status === "ready").length

  const feed = buildFeed(loans, reservations).slice(0, ACTIVITY_PREVIEW_COUNT)

  const lastReturn = [...loans]
    .filter((l) => l.status === "returned" && l.returned_at)
    .sort((a, b) => new Date(b.returned_at!).getTime() - new Date(a.returned_at!).getTime())[0]

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1
            className="text-ink-900 font-semibold leading-tight"
            style={{ fontSize: "var(--text-4xl)", fontFamily: "var(--font-display)" }}
          >
            LRC <span className="italic text-green-700">Operations</span>
          </h1>
          <p
            className="text-ink-500 mt-1"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            Today is {today}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/librarian/catalog"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add new book</span>
            <span className="sm:hidden">Add</span>
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:flex gap-3 sm:gap-4 sm:flex-wrap">
        <StatCard
          icon={<BookOpen size={18} className="text-green-700" />}
          iconBg="bg-green-100"
          label="Total Collection"
          value={totalCopies === null ? "—" : totalCopies.toLocaleString()}
          sub="Physical copies across the catalog"
        />
        <StatCard
          icon={<Users size={18} className="text-info" />}
          iconBg="bg-info-bg"
          label="Active Borrowers"
          value={String(activeBorrowers)}
          sub={`${activeLoans.length} book${activeLoans.length === 1 ? "" : "s"} out`}
        />
        <StatCard
          icon={<Bookmark size={18} className="text-gold-600" />}
          iconBg="bg-gold-100"
          label="Pending Reservations"
          value={String(pendingReservations)}
          sub={`${readyReservations} ready for pickup`}
        />
        <StatCard
          icon={<AlertCircle size={18} className="text-danger" />}
          iconBg="bg-danger-bg"
          label="Overdue"
          value={String(overdueLoans.length)}
          sub={`${deepOverdue} over ${OVERDUE_FLAG_DAYS} days late`}
          subColor="text-danger"
        />
      </div>

      {/* Main content: transactions + last return */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Recent Transactions */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2
              className="text-ink-900 font-semibold"
              style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
            >
              Recent Activity
            </h2>
            <Link
              href="/librarian/reports?tab=activity"
              className="text-green-700 font-semibold hover:text-green-900 transition-colors"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              See all →
            </Link>
          </div>

          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">

            {!loading && feed.length === 0 && (
              <div className="flex items-center justify-center py-10 text-ink-400" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                No activity yet.
              </div>
            )}

            {feed.length > 0 && (
              <>
                {/* Desktop table header */}
                <div
                  className="hidden sm:flex px-4 py-2.5 border-b border-ink-100 text-ink-400 uppercase font-semibold"
                  style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
                >
                  <span className="w-24">Date &amp; Time</span>
                  <span className="w-24">Type</span>
                  <span className="flex-1">User</span>
                  <span className="flex-1">Item</span>
                </div>

                <div className="flex flex-col divide-y divide-ink-100">
                  {feed.map((tx) => {
                    const cfg = TX_CONFIG[tx.type]
                    return (
                      <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-0 px-4 py-3">

                        {/* Mobile: date/time + type on one row */}
                        <div className="flex items-center justify-between sm:hidden">
                          <span className="text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            {tx.date} · {tx.time}
                          </span>
                          <span className={cn("flex items-center px-2 py-0.5 rounded-pill", cfg.bg)} style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
                          </span>
                        </div>

                        {/* Desktop columns */}
                        <span className="hidden sm:block w-24 leading-tight">
                          <span className="block text-ink-400" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                            {tx.date}
                          </span>
                          <span className="block text-ink-500" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                            {tx.time}
                          </span>
                        </span>
                        <span className="hidden sm:flex w-24">
                          <span className={cn("flex items-center px-2 py-0.5 rounded-pill", cfg.bg)} style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
                          </span>
                        </span>

                        {/* User + item */}
                        <div className="flex flex-col sm:flex-row sm:flex-1 sm:items-center gap-0.5 sm:gap-0">
                          <span className="text-ink-900 font-medium sm:flex-1 truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                            {tx.user}
                          </span>
                          <span className="text-ink-500 sm:flex-1 truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                            {tx.item}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Last Return */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <h2
            className="text-ink-900 font-semibold"
            style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
          >
            Last Return
          </h2>

          {lastReturn ? (
            <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center rounded-full bg-success-bg shrink-0" style={{ width: 36, height: 36 }}>
                  <Check size={18} className="text-success" />
                </div>
                <div>
                  <p className="text-ink-900 font-semibold" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                    Book Successfully Returned
                  </p>
                  <p className="text-ink-400" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                    {timeLabel(lastReturn.returned_at!)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 bg-ink-50 rounded-(--radius-sm) p-3">
                <DetailRow label="Book" value={lastReturn.books?.title ?? "Unknown title"} />
                <DetailRow label="Borrower" value={lastReturn.profiles?.full_name ?? "Unknown"} />
                <DetailRow label="Condition" value={lastReturn.condition_at_return ?? "—"} />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-(--radius) border border-ink-200 p-6 flex items-center justify-center text-ink-400" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
              No returns yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-500 shrink-0" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
        {label}
      </span>
      <span className="text-ink-900 font-medium text-right" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
        {value}
      </span>
    </div>
  )
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  sub,
  subColor,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub: string
  subColor?: string
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
        <p className={cn("mt-0.5 truncate", subColor || "text-ink-500")} style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
          {sub}
        </p>
      </div>
    </div>
  )
}
