// apps/web/app/librarian/patrons/page.tsx
// Sprint 5.5 — Librarian Manage Users Screen
// 5.5.1 Users list table (search + filter) · 5.5.2 Profile modal · 5.5.3 Account actions

"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@lasallia/types"
import { MOCK_PATRONS } from "@/lib/mock/patrons"
import {
  PatronsToolbar,
  type RoleFilter,
} from "@/components/ui/patrons/PatronsToolbar"
import { PatronsTable } from "@/components/ui/patrons/PatronsTable"
import { PatronProfileModal } from "@/components/ui/patrons/PatronProfileModal"
import { ConfirmStatusDialog } from "@/components/ui/patrons/ConfirmStatusDialog"

const PAGE_SIZE = 8

// ─── Pagination hook + Paginator ─────────────────────────────────────────────
// Local to this page, matching the pattern used in student/library/page.tsx

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

  function pageNumbers(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const nums: (number | "…")[] = [1]
    if (page > 3) nums.push("…")
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) nums.push(i)
    if (page < totalPages - 2) nums.push("…")
    nums.push(totalPages)
    return nums
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
        Showing <span className="font-medium text-ink-600">{start}–{end}</span> of{" "}
        <span className="font-medium text-ink-600">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-[8px] border transition-colors",
            page === 1 ? "border-ink-100 text-ink-300 cursor-not-allowed" : "border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300"
          )}
        >
          <ChevronLeft size={14} />
        </button>

        {pageNumbers().map((n, i) =>
          n === "…" ? (
            <span key={`ellipsis-${i}`} className="flex items-center justify-center w-8 h-8 text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => goTo(n as number)}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-[8px] border font-medium transition-colors",
                n === page ? "bg-green-700 border-green-700 text-white font-semibold" : "border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
            >
              {n}
            </button>
          )
        )}

        <button
          onClick={() => goTo(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-[8px] border transition-colors",
            page === totalPages ? "border-ink-100 text-ink-300 cursor-not-allowed" : "border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300"
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PatronsPage() {
  const [patrons, setPatrons] = useState<UserProfile[]>(MOCK_PATRONS)

  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")

  const [viewing, setViewing] = useState<UserProfile | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<UserProfile | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patrons.filter((p) => {
      const matchesQuery =
        !q ||
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.program ?? "").toLowerCase().includes(q)
      const matchesRole = roleFilter === "all" || p.role === roleFilter
      return matchesQuery && matchesRole
    })
  }, [patrons, query, roleFilter])

  const { page, totalPages, pageItems, goTo } = usePagination(filtered, `${query}|${roleFilter}`)

  function handleToggleStatus(userId: string) {
    setPatrons((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, status: p.status === "inactive" ? "active" : "inactive" } : p))
    )
    setConfirmingStatus(null)
    setViewing((v) => (v && v.id === userId ? { ...v, status: v.status === "inactive" ? "active" : "inactive" } : v))
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

      <PatronsToolbar
        query={query}
        onQueryChange={setQuery}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        resultCount={filtered.length}
      />

      <PatronsTable
        patrons={pageItems}
        onView={setViewing}
        onToggleStatus={setConfirmingStatus}
      />

      <Paginator page={page} totalPages={totalPages} goTo={goTo} totalItems={filtered.length} />

      {viewing && (
        <PatronProfileModal
          patron={viewing}
          onClose={() => setViewing(null)}
          onToggleStatus={() => setConfirmingStatus(viewing)}
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