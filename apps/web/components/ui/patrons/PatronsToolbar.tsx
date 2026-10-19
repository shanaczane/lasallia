// Search, filters and export for the patrons table.

"use client"

import { Search, X, Users, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLLEGES } from "@/lib/colleges"

export type StatusFilter = "all" | "active" | "inactive"

// Dropdown arrow, same as other selects.
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

type PatronsToolbarProps = {
  query: string
  onQueryChange: (v: string) => void
  collegeFilter: string
  onCollegeFilterChange: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (v: StatusFilter) => void
  resultCount: number
  /** Exports the filtered list, not every patron. */
  onExport: () => void
  exportDisabled?: boolean
}

export function PatronsToolbar({
  query,
  onQueryChange,
  collegeFilter,
  onCollegeFilterChange,
  statusFilter,
  onStatusFilterChange,
  resultCount,
  onExport,
  exportDisabled,
}: PatronsToolbarProps) {
  const selectClass = cn(
    "shrink-0 min-w-[128px] sm:min-w-[150px] bg-white border border-ink-200 text-ink-700 rounded-sm px-2.5 py-2",
    "focus:outline-none focus:border-green-700 cursor-pointer",
    "hover:border-ink-300 transition-colors appearance-none pr-7"
  )
  const selectStyle = {
    fontSize: "var(--text-sm-body)",
    fontFamily: "var(--font-body)",
    backgroundImage: `url("${SELECT_CHEVRON}")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 7px center",
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search and filters, sticky while scrolling. */}
      <div
        className="sticky z-40 bg-paper/95 backdrop-blur-sm border-b border-ink-100 py-3 -mt-3 flex flex-row flex-wrap items-stretch gap-2"
        style={{ top: 'var(--height-nav)' }}
      >
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
            placeholder="Search by name, email, ID number, or program…"
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

        {/* College filter */}
        <select
          value={collegeFilter}
          onChange={(e) => onCollegeFilterChange(e.target.value)}
          aria-label="Filter by college"
          className={selectClass}
          style={selectStyle}
        >
          <option value="all">All colleges</option>
          {COLLEGES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Account status filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
          aria-label="Filter by account status"
          className={selectClass}
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {/* Export CSV (of the filtered list) */}
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          className={cn(
            "flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-sm border border-ink-200 text-ink-700",
            "hover:bg-ink-50 hover:border-ink-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          )}
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          <Download size={14} /> Export CSV
        </button>
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