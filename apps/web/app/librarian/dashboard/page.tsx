// apps/web/app/librarian/dashboard/page.tsx
"use client"

import Link from "next/link"
import {
  BookOpen,
  Users,
  Bookmark,
  AlertCircle,
  Plus,
  Download,
  Check,
  MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"

type TxType = "checkout" | "return" | "reserve"

type Transaction = {
  id: string
  time: string
  type: TxType
  user: string
  item: string
}

const TX_CONFIG: Record<TxType, { label: string; bg: string; text: string }> = {
  checkout: { label: "Checkout", bg: "bg-info-bg", text: "text-info" },
  return:   { label: "Return",   bg: "bg-success-bg", text: "text-success" },
  reserve:  { label: "Reserve",  bg: "bg-warn-bg", text: "text-warn" },
}

const TRANSACTIONS: Transaction[] = [
  { id: "1", time: "10:42 AM", type: "checkout", user: "Shan A. Cruz",       item: "Clean Architecture" },
  { id: "2", time: "10:31 AM", type: "return",   user: "Khatrina Gonzales", item: "Database System Concepts" },
  { id: "3", time: "10:18 AM", type: "reserve",  user: "Jed F. Sayat",      item: "The Pragmatic Programmer" },
  { id: "4", time: "09:55 AM", type: "checkout", user: "Maria L. Reyes",    item: "Computer Networks (6th Ed)" },
  { id: "5", time: "09:42 AM", type: "return",   user: "Paolo M. Aguilar",  item: "Operating System Concepts" },
]

export default function LibrarianDashboard() {
  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

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
          <button
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export report</span>
            <span className="sm:hidden">Export</span>
          </button>
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
          value="42,318"
          sub="↑ 124 this month"
          subColor="text-success"
        />
        <StatCard
          icon={<Users size={18} className="text-info" />}
          iconBg="bg-info-bg"
          label="Active Borrowers"
          value="1,247"
          sub="↑ 8.2% vs last week"
          subColor="text-success"
        />
        <StatCard
          icon={<Bookmark size={18} className="text-gold-600" />}
          iconBg="bg-gold-100"
          label="Pending Reservations"
          value="38"
          sub="12 ready for pickup"
        />
        <StatCard
          icon={<AlertCircle size={18} className="text-danger" />}
          iconBg="bg-danger-bg"
          label="Overdue"
          value="17"
          sub="3 over 7 days late"
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
              Recent Transactions
            </h2>
            <Link
              href="/librarian/reports"
              className="text-green-700 font-medium hover:underline whitespace-nowrap"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              View log →
            </Link>
          </div>

          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">

            {/* Desktop table header */}
            <div
              className="hidden sm:flex px-4 py-2.5 border-b border-ink-100 text-ink-400 uppercase font-semibold"
              style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
            >
              <span className="w-20">Time</span>
              <span className="w-24">Type</span>
              <span className="flex-1">User</span>
              <span className="flex-1">Item</span>
              <span className="w-6"></span>
            </div>

            <div className="flex flex-col divide-y divide-ink-100">
              {TRANSACTIONS.map((tx) => {
                const cfg = TX_CONFIG[tx.type]
                return (
                  <div key={tx.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-0 px-4 py-3">

                    {/* Mobile: time + type on one row */}
                    <div className="flex items-center justify-between sm:hidden">
                      <span className="text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                        {tx.time}
                      </span>
                      <span
                        className={cn("flex items-center px-2 py-0.5 rounded-pill", cfg.bg)}
                        style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
                      >
                        <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
                      </span>
                    </div>

                    {/* Desktop columns */}
                    <span className="hidden sm:block w-20 text-ink-500" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                      {tx.time}
                    </span>
                    <span className="hidden sm:flex w-24">
                      <span
                        className={cn("flex items-center px-2 py-0.5 rounded-pill", cfg.bg)}
                        style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
                      >
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

                    <button className="hidden sm:flex items-center justify-center w-6 text-ink-400 hover:text-ink-900">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
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
                  Scanned today · 09:42 AM
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-ink-50 rounded-sm(--radius-sm) p-3">
              <DetailRow label="Book" value="Clean Code" />
              <DetailRow label="Borrower" value="Shan A. Cruz" />
              <DetailRow label="Condition" value="Good" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
        {label}
      </span>
      <span className="text-ink-900 font-medium" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
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