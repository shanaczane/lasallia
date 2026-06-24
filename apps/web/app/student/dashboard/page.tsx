// apps/web/app/student/dashboard/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Clock,
  Bookmark,
  Star,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"

type BorrowStatus = "due_soon" | "overdue" | "active"

type BorrowedBook = {
  id: string
  title: string
  author: string
  borrowedDate: string
  dueDate: string
  status: BorrowStatus
}

type RecommendedBook = {
  id: string
  title: string
  author: string
  coverColor: string
}

const STATUS_CONFIG: Record<BorrowStatus, { label: string; dot: string; text: string }> = {
  due_soon: { label: "Due Soon", dot: "bg-warn", text: "text-warn" },
  overdue:  { label: "Overdue",  dot: "bg-danger", text: "text-danger" },
  active:   { label: "Active",   dot: "bg-success", text: "text-success" },
}

const BORROWED_BOOKS: BorrowedBook[] = [
  { id: "1", title: "Clean Code", author: "Robert C. Martin", borrowedDate: "Nov 7", dueDate: "Nov 21", status: "due_soon" },
  { id: "2", title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", borrowedDate: "Nov 3", dueDate: "Nov 17", status: "overdue" },
  { id: "3", title: "The Pragmatic Programmer", author: "Thomas, Hunt", borrowedDate: "Nov 13", dueDate: "Nov 27", status: "active" },
  { id: "4", title: "Computer Networks, 6th Ed.", author: "Andrew Tanenbaum", borrowedDate: "Nov 14", dueDate: "Nov 28", status: "active" },
]

const RECOMMENDED_BOOKS: RecommendedBook[] = [
  { id: "1", title: "Artificial Intelligence: A Modern Approach", author: "Russell · Norvig", coverColor: "bg-[#3D3B1F]" },
  { id: "2", title: "Database System Concepts", author: "Silberschatz et al.", coverColor: "bg-[#2E1A47]" },
  { id: "3", title: "Operating System Concepts", author: "Silberschatz et al.", coverColor: "bg-[#1A2540]" },
]

type FilterKey = "all" | "due_soon" | "overdue" | "active"

export default function StudentDashboard() {
  const [filter, setFilter] = useState<FilterKey>("all")

  const dueSoonCount = BORROWED_BOOKS.filter((b) => b.status === "due_soon").length
  const overdueCount = BORROWED_BOOKS.filter((b) => b.status === "overdue").length
  const activeCount = BORROWED_BOOKS.filter((b) => b.status === "active").length

  const filteredBooks =
    filter === "all" ? BORROWED_BOOKS : BORROWED_BOOKS.filter((b) => b.status === filter)

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: BORROWED_BOOKS.length },
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
            Good morning, <span className="italic text-green-700">Shan</span>.
          </h1>
          <p
            className="text-ink-500 mt-1"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            You have 4 books out, 1 due in 2 days.
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
          value="4"
          sub="Borrowing limit: 5 books"
        />
        <StatCard
          icon={<Clock size={18} className="text-warn" />}
          iconBg="bg-warn-bg"
          label="Due Soon"
          value="1"
          sub='"Clean Code" — Nov 21'
        />
        <StatCard
          icon={<Bookmark size={18} className="text-gold-600" />}
          iconBg="bg-gold-100"
          label="Active Reservations"
          value="2"
          sub="1 ready for pickup"
        />
        <StatCard
          icon={<Star size={18} className="text-green-700" />}
          iconBg="bg-green-100"
          label="Recommended for You"
          value="12"
          sub="Based on your program"
        />
      </div>

      {/* Main content: borrowed list + recommendations */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Currently Borrowed */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <h2
              className="text-ink-900 font-semibold"
              style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
            >
              Currently Borrowed
            </h2>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
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

          {/* See all — above table */}
          <div className="flex justify-end">
            <Link
              href="/student/library"
              className="text-green-700 font-medium hover:underline"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              See all →
            </Link>
          </div>

          {/* Borrowed books — table on desktop, cards on mobile */}
          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">

            {/* Desktop table header */}
            <div
              className="hidden sm:flex px-4 py-2.5 border-b border-ink-100 text-ink-400 uppercase font-semibold"
              style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
            >
              <span className="flex-1">Book</span>
              <span className="w-20">Borrowed</span>
              <span className="w-20">Due Date</span>
              <span className="w-24">Status</span>
              <span className="w-20"></span>
            </div>

            <div className="flex flex-col divide-y divide-ink-100">
              {filteredBooks.map((book) => {
                const status = STATUS_CONFIG[book.status]
                return (
                  <div key={book.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 px-4 py-3">

                    {/* Book info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-ink-900 font-semibold truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                        {book.title}
                      </p>
                      <p className="text-ink-500 truncate" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                        {book.author}
                      </p>
                    </div>

                    {/* Mobile: dates + status inline */}
                    <div className="flex sm:hidden items-center gap-3 text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                      <span>Borrowed {book.borrowedDate}</span>
                      <span className={cn("font-medium", status.text)}>Due {book.dueDate}</span>
                    </div>

                    {/* Desktop columns */}
                    <span className="hidden sm:block w-20 text-ink-500" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                      {book.borrowedDate}
                    </span>
                    <span className={cn("hidden sm:block w-20 font-medium", status.text)} style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                      {book.dueDate}
                    </span>

                    <div className="flex items-center justify-between sm:justify-start sm:w-24 gap-2">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                        <span className={cn("font-medium", status.text)} style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                          {status.label}
                        </span>
                      </span>

                      <button
                        className="sm:hidden px-3 py-1 rounded-sm border border-ink-200 text-ink-700 font-medium hover:bg-ink-50 transition-colors"
                        style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
                      >
                        Renew
                      </button>
                    </div>

                    <button
                      className="hidden sm:block w-20 ml-auto px-3 py-1 rounded-sm border border-ink-200 text-ink-700 font-medium hover:bg-ink-50 transition-colors"
                      style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
                    >
                      Renew
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Picked for You */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <h2
            className="text-ink-900 font-semibold"
            style={{ fontSize: "var(--text-xl)", fontFamily: "var(--font-display)" }}
          >
            Picked for You
          </h2>

          <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex flex-col gap-3">
            {RECOMMENDED_BOOKS.map((book, i) => (
              <div
                key={book.id}
                className={cn(
                  "flex gap-3 pb-3",
                  i < RECOMMENDED_BOOKS.length - 1 && "border-b border-ink-100"
                )}
              >
                <div className={cn("shrink-0 rounded-sm", book.coverColor)} style={{ width: 40, height: 56 }} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-ink-900 font-semibold leading-snug" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                    {book.title}
                  </p>
                  <p className="text-ink-500" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                    {book.author}
                  </p>
                </div>
              </div>
            ))}

            <Link
              href="/student/catalog"
              className="text-green-700 font-medium hover:underline"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              See more →
            </Link>
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