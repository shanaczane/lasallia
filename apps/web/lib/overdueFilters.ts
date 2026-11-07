// Filters and labels for the overdue list. No imports from the app, so
// lib/overdueFilters.test.ts runs on its own.

export type OverdueRange = "all" | "1-3" | "4-7" | "8-14" | "15-30" | "31+"

export const OVERDUE_RANGES: { value: OverdueRange; label: string; min: number; max: number | null }[] = [
  { value: "all", label: "Any length", min: 0, max: null },
  // Includes items past their due time with no full school day gone yet.
  { value: "1-3", label: "Up to 3 school days", min: 0, max: 3 },
  { value: "4-7", label: "4–7 school days", min: 4, max: 7 },
  { value: "8-14", label: "8–14 school days", min: 8, max: 14 },
  { value: "15-30", label: "15–30 school days", min: 15, max: 30 },
  { value: "31+", label: "Over 30 school days", min: 31, max: null },
]

export const REMINDER_KIND_LABEL: Record<string, string> = {
  due_tomorrow: "Due tomorrow",
  due_today: "Due today",
  overdue_first: "First overdue notice",
  overdue_repeat: "Repeat overdue notice",
  reserve_due_soon: "Reserve due soon",
  reserve_overdue: "Reserve overdue",
  manual: "Sent by a librarian",
}

export type OverdueFilters = { userType: string; collectionType: string; range: OverdueRange }

export function matchesOverdueFilters(
  row: { role: string | null; collectionType: string; daysOverdue: number },
  filters: OverdueFilters,
): boolean {
  if (filters.userType !== "all" && row.role !== filters.userType) return false
  if (filters.collectionType !== "all" && row.collectionType !== filters.collectionType) return false
  const range = OVERDUE_RANGES.find((r) => r.value === filters.range)
  if (!range) return true
  return row.daysOverdue >= range.min && (range.max === null || row.daysOverdue <= range.max)
}
