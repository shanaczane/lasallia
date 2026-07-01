// apps/web/components/ui/patrons/PatronsToolbar.tsx
// Sprint 5.5.1 — search + filter controls for the users list table

"use client"

import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole, UserAccountStatus } from "@lasallia/types"
import { ROLE_LABEL, STATUS_LABEL } from "@/lib/mock/patrons"

export type RoleFilter = "all" | UserRole
export type StatusFilter = "all" | UserAccountStatus

const ROLE_FILTERS: RoleFilter[] = ["all", "student", "faculty", "librarian"]
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "inactive"]

type PatronsToolbarProps = {
  query: string
  onQueryChange: (v: string) => void
  roleFilter: RoleFilter
  onRoleFilterChange: (v: RoleFilter) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (v: StatusFilter) => void
  resultCount: number
}

export function PatronsToolbar({
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  resultCount,
}: PatronsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div
        className={cn(
          "flex items-center gap-2 px-3.5 py-2.5 rounded-(--radius) bg-white border transition-colors w-full sm:max-w-sm",
          "border-ink-200 focus-within:border-green-700 focus-within:shadow-(--shadow-focus-green)"
        )}
      >
        <Search size={16} className="shrink-0 text-ink-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name, email, or program…"
          className="flex-1 min-w-0 bg-transparent text-ink-900 placeholder:text-ink-300 focus:outline-none"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <FilterGroup label="Role">
          {ROLE_FILTERS.map((r) => (
            <FilterChip
              key={r}
              active={roleFilter === r}
              onClick={() => onRoleFilterChange(r)}
              label={r === "all" ? "All" : ROLE_LABEL[r]}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="Status">
          {STATUS_FILTERS.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => onStatusFilterChange(s)}
              label={s === "all" ? "All" : STATUS_LABEL[s]}
            />
          ))}
        </FilterGroup>

        <p
          className="text-ink-400 sm:ml-auto"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
        >
          <span className="font-medium text-ink-600">{resultCount}</span> user{resultCount === 1 ? "" : "s"} found
        </p>
      </div>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className="text-ink-400 font-semibold uppercase mr-0.5"
        style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full border font-medium transition-colors",
        active
          ? "bg-green-700 border-green-700 text-white font-semibold"
          : "bg-white border-ink-200 text-ink-600 hover:bg-ink-50"
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
    >
      {label}
    </button>
  )
}