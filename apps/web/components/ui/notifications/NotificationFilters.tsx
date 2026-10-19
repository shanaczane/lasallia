"use client"

import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Notification } from "@lasallia/types"

export type DateRange = "any" | "today" | "7d" | "30d" | "custom"

export type NotificationFilterState = {
  query: string
  dateRange: DateRange
  /** yyyy-mm-dd, only used when dateRange is "custom" */
  from: string
  to: string
}

export const DEFAULT_NOTIFICATION_FILTERS: NotificationFilterState = {
  query: "",
  dateRange: "any",
  from: "",
  to: "",
}

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "any",    label: "Any time" },
  { value: "today",  label: "Today" },
  { value: "7d",     label: "Last 7 days" },
  { value: "30d",    label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
]

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// Date inputs give "yyyy-mm-dd"; parse as local midnight, not UTC, so a
// notification from late evening isn't pushed into the next day.
function parseLocalDate(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function isFilterActive(f: NotificationFilterState): boolean {
  return (
    f.query.trim() !== "" ||
    (f.dateRange !== "any" && (f.dateRange !== "custom" || f.from !== "" || f.to !== ""))
  )
}

export function filterNotifications(
  notifications: Notification[],
  f: NotificationFilterState,
): Notification[] {
  const query = f.query.trim().toLowerCase()

  let from: Date | null = null
  let to: Date | null = null // exclusive upper bound
  const today = startOfDay(new Date())
  switch (f.dateRange) {
    case "today":
      from = today
      break
    case "7d":
      from = new Date(today)
      from.setDate(from.getDate() - 6)
      break
    case "30d":
      from = new Date(today)
      from.setDate(from.getDate() - 29)
      break
    case "custom": {
      from = parseLocalDate(f.from)
      const end = parseLocalDate(f.to)
      if (end) {
        to = new Date(end)
        to.setDate(to.getDate() + 1)
      }
      break
    }
  }

  return notifications.filter((n) => {
    const created = new Date(n.created_at)
    if (from && created < from) return false
    if (to && created >= to) return false
    if (query && !`${n.title} ${n.message}`.toLowerCase().includes(query)) return false
    return true
  })
}

// Same chevron the other filter dropdowns use (PatronsToolbar, Reservations)
// — the native arrow sits flush against the edge and differs per browser.
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

const controlClass =
  "h-9 rounded-(--radius-sm) border border-ink-200 bg-white text-ink-700 px-2.5 focus:outline-none focus:ring-2 focus:ring-green-700/30 focus:border-green-700"

const controlStyle = { fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }

type NotificationFiltersProps = {
  value: NotificationFilterState
  onChange: (next: NotificationFilterState) => void
  /** Prefix for input ids so two filter bars on one page don't collide. */
  idPrefix?: string
  className?: string
}

export function NotificationFilters({
  value,
  onChange,
  idPrefix = "notif",
  className,
}: NotificationFiltersProps) {
  function set<K extends keyof NotificationFilterState>(key: K, v: NotificationFilterState[K]) {
    onChange({ ...value, [key]: v })
  }

  const active = isFilterActive(value)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id={`${idPrefix}-search`}
            name="notification-search"
            type="search"
            aria-label="Search notifications"
            placeholder="Search notifications"
            value={value.query}
            onChange={(e) => set("query", e.target.value)}
            className={cn(controlClass, "w-full pl-8")}
            style={controlStyle}
          />
        </div>

        {/* Date range */}
        <select
          id={`${idPrefix}-date-range`}
          name="notification-date-range"
          aria-label="Filter by date"
          value={value.dateRange}
          onChange={(e) => set("dateRange", e.target.value as DateRange)}
          className={cn(controlClass, "appearance-none cursor-pointer pl-3 pr-8 hover:border-ink-300")}
          style={{
            ...controlStyle,
            backgroundImage: `url("${SELECT_CHEVRON}")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
          }}
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {active && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_NOTIFICATION_FILTERS)}
            className="flex items-center gap-1 h-9 px-2 rounded-(--radius-sm) text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors"
            style={controlStyle}
          >
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      {value.dateRange === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={`${idPrefix}-from`}
            className="text-ink-500"
            style={controlStyle}
          >
            From
          </label>
          <input
            id={`${idPrefix}-from`}
            name="notification-from"
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => set("from", e.target.value)}
            className={controlClass}
            style={controlStyle}
          />
          <label
            htmlFor={`${idPrefix}-to`}
            className="text-ink-500"
            style={controlStyle}
          >
            To
          </label>
          <input
            id={`${idPrefix}-to`}
            name="notification-to"
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => set("to", e.target.value)}
            className={controlClass}
            style={controlStyle}
          />
        </div>
      )}
    </div>
  )
}
