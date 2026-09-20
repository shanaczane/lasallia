// apps/web/app/student/dashboard/page.tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Clock,
  Bookmark,
  Search,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getUser } from "@/lib/auth"
import { fetchLoans, type Loan as ApiLoan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import { ForYouSection } from "@/components/ui/dashboard/ForYouSection"
import type { Reservation } from "@lasallia/types"

type BorrowStatus = "due_soon" | "overdue" | "active"

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

export default function StudentDashboard() {
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

  const nextDue = [...activeLoans]
    .filter((x) => x.status !== "overdue")
    .sort((a, b) => new Date(a.loan.due_date).getTime() - new Date(b.loan.due_date).getTime())[0]

  const activeReservations = reservations.filter((r) => r.status === "pending" || r.status === "ready")
  const readyForPickup = reservations.filter((r) => r.status === "ready").length

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

        {/* Desktop/tablet only — on phone this becomes a floating button
            (below) instead of competing with the greeting for space. */}
        <Link
          href="/student/catalog"
          className="hidden sm:flex items-center justify-center gap-2 px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors shadow-sm self-start"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          <Search size={15} />
          Find a book
        </Link>
      </div>

      {/* Phone only — floating "Find a book" button, pinned to the bottom
          corner so it stays reachable while scrolling instead of sitting
          fixed in the page flow. Clears the phone's home-indicator/gesture
          area via safe-area-inset-bottom, same convention FilterSheet's
          footer already uses. */}
      <Link
        href="/student/catalog"
        aria-label="Find a book"
        className="sm:hidden fixed right-4 flex items-center justify-center w-14 h-14 rounded-full bg-green-700 text-white hover:bg-green-800 active:bg-green-900 transition-colors"
        style={{
          bottom: "max(1rem, env(safe-area-inset-bottom))",
          boxShadow: "var(--shadow-lg)",
          zIndex: "var(--z-fab)",
        }}
      >
        <Search size={22} />
      </Link>

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

      {/* For You — recommendations plan Phase 6 */}
      <ForYouSection />
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
