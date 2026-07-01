// apps/web/components/ui/patrons/PatronsToolbar.tsx
// Sprint 5.5.1 — search + filter controls for the users list table
// Fix: status filter removed; search + role filter now always sit beside each
// other (flex-row) on every device — the select shrinks instead of the two
// controls stacking, so the toolbar stays compact even on small phones. Only
// wraps to a second line as a last resort on extremely narrow viewports.

"use client"

import { Search, X, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRole } from "@lasallia/types"
import { ROLE_LABEL } from "@/lib/mock/patrons"

export type RoleFilter = "all" | UserRole

const ROLE_FILTERS: RoleFilter[] = ["all", "student", "faculty", "librarian"]

// Shared select chevron — matches the Sort control on the Catalog tab
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

type PatronsToolbarProps = {
  query: string
  onQueryChange: (v: string) => void
  roleFilter: RoleFilter
  onRoleFilterChange: (v: RoleFilter) => void
  resultCount: number
}

export function PatronsToolbar({
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
  resultCount,
}: PatronsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search + role filter — beside each other on every device.
          Search grows to fill space; the select has a comfortable min-width
          and only drops to its own line on truly tiny viewports. */}
      <div className="flex flex-row flex-wrap items-stretch gap-2">
        {/* Search */}
        <div className="flex-1 min-w-[160px] relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name, email, or program…"
            className={cn(
              "w-full pl-9 pr-8 py-2 rounded-sm border bg-white text-ink-900",
              "placeholder:text-ink-300 focus:outline-none transition-colors",
              "border-ink-200 focus:border-green-700 hover:border-ink-300"
            )}
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value as RoleFilter)}
          aria-label="Filter by role"
          className={cn(
            "shrink-0 min-w-[128px] sm:min-w-[168px] bg-white border border-ink-200 text-ink-700 rounded-sm px-2.5 py-2",
            "focus:outline-none focus:border-green-700 cursor-pointer",
            "hover:border-ink-300 transition-colors appearance-none pr-7"
          )}
          style={{
            fontSize: "var(--text-sm-body)",
            fontFamily: "var(--font-body)",
            backgroundImage: `url("${SELECT_CHEVRON}")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 7px center",
          }}
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r} value={r}>
              {r === "all" ? "All roles" : ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {/* Result count */}
      <p
        className="flex items-center gap-1.5 text-ink-500"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <Users size={13} className="text-ink-400 shrink-0" />
        <span className="font-semibold text-ink-900">{resultCount}</span>
        {resultCount === 1 ? "user found" : "users found"}
        {query && (
          <>
            {" "}for &ldquo;<span className="text-ink-700">{query}</span>&rdquo;
          </>
        )}
      </p>
    </div>
  )
}