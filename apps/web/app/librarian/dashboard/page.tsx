// apps/web/app/librarian/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Users,
  Bookmark,
  AlertCircle,
  ScanLine,
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
const ACTIVITY_PREVIEW_COUNT = 8

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

  // Latest first, top 2 — same "short preview, full history lives on the
  // Activity Log" pattern as the Recent Activity feed above.
  const recentReturns = [...loans]
    .filter((l) => l.status === "returned" && l.returned_at)
    .sort((a, b) => new Date(b.returned_at!).getTime() - new Date(a.returned_at!).getTime())
    .slice(0, 2)

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
            href="/librarian/borrow-return"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            <ScanLine size={15} />
            <span className="hidden sm:inline">Borrow &amp; Return</span>
            <span className="sm:hidden">Scan</span>
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
                {/* Mobile: stacked cards — a table forces horizontal scroll
                    at phone width, so this stays a simple list instead. */}
                <div className="flex flex-col divide-y divide-ink-100 sm:hidden">
                  {feed.map((tx) => {
                    const cfg = TX_CONFIG[tx.type]
                    return (
                      <div key={tx.id} className="flex flex-col gap-1.5 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            {tx.date} · {tx.time}
                          </span>
                          <span className={cn("flex items-center px-2 py-0.5 rounded-pill", cfg.bg)} style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
                          </span>
                        </div>
                        <span className="text-ink-900 font-medium truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                          {tx.user}
                        </span>
                        <span className="text-ink-500 truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                          {tx.item}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Desktop: a real <table> — the header and body used to be
                    separate flex rows with matching fixed widths (w-24/w-40)
                    that only lined up as long as no cell's content needed
                    more room than its box, which the all-caps tracked-out
                    header text didn't reliably fit.
                    table-fixed + percentage <col> widths (rather than
                    auto-layout with a min-w-* + overflow-x-auto escape
                    hatch) so the table always spans exactly the container's
                    width — no horizontal scrollbar at any size — and every
                    column truncates its own content instead of pushing the
                    table wider. */}
                <div className="hidden sm:block">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col style={{ width: "17%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "22%" }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-ink-200 bg-ink-50">
                        {["Date & Time", "Type", "User", "Item"].map((label) => (
                          <th
                            key={label}
                            className="text-left py-2.5 px-4 text-ink-500 font-semibold uppercase select-none"
                            style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-eyebrow)", fontFamily: "var(--font-body)" }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {feed.map((tx) => {
                        const cfg = TX_CONFIG[tx.type]
                        return (
                          <tr key={tx.id} className="hover:bg-ink-50 transition-colors">
                            <td className="py-3 px-4 align-top">
                              <span className="block text-ink-700 truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                                {tx.date}
                              </span>
                              <span className="block text-ink-400 truncate" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
                                {tx.time}
                              </span>
                            </td>
                            <td className="py-3 px-4 align-top">
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-pill", cfg.bg)} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                                <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 align-top">
                              <p className="text-ink-900 font-medium truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                                {tx.user}
                              </p>
                            </td>
                            <td className="py-3 px-4 align-top">
                              <p className="text-ink-500 truncate" title={tx.item} style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                                {tx.item}
                              </p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recent Returns — top 2, latest on top */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2
              className="text-ink-900 font-semibold"
              style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
            >
              Recent Returns
            </h2>
            <Link
              href="/librarian/reports?tab=activity"
              className="text-green-700 font-semibold hover:text-green-900 transition-colors"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              See more →
            </Link>
          </div>

          {recentReturns.length > 0 ? (
            <div className="flex flex-col gap-3">
              {recentReturns.map((r) => (
                <div key={r.id} className="bg-white rounded-(--radius) border border-ink-200 p-4 flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center rounded-full bg-success-bg shrink-0" style={{ width: 36, height: 36 }}>
                      <Check size={18} className="text-success" />
                    </div>
                    <div>
                      <p className="text-ink-900 font-semibold" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                        Book Successfully Returned
                      </p>
                      <p className="text-ink-400" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                        {timeLabel(r.returned_at!)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 bg-ink-50 rounded-(--radius-sm) p-3">
                    <DetailRow label="Book" value={r.books?.title ?? "Unknown title"} />
                    <DetailRow label="Borrower" value={r.profiles?.full_name ?? "Unknown"} />
                    <DetailRow label="Condition" value={r.condition_at_return ?? "—"} />
                  </div>
                </div>
              ))}
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
