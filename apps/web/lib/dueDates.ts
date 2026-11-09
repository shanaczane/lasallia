// The one way dates and times are written for loans and reservations:
// "November 14, 2026" and "5:00 PM", always in Manila time. Matches
// date_text and time_text in apps/api/core/dates.py. No imports, so
// lib/overdueFilters.test.ts runs without the app.

const TIME_ZONE = "Asia/Manila"
const DAY_MS = 86_400_000

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value))

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ""
  return toDate(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TIME_ZONE })
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return ""
  return toDate(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return value ? `${formatDate(value)}, ${formatTime(value)}` : ""
}

function manilaDayNumber(value: string | Date): number {
  return Date.parse(toDate(value).toLocaleDateString("en-CA", { timeZone: TIME_ZONE })) / DAY_MS
}

// For a loan still out: "Due tomorrow", "Due today, 5:00 PM", "Due in 3 days".
// Past its due date it falls back to the date; overdue loans show overdue_label.
export function dueLabel(due: string | Date, now: Date = new Date()): string {
  const days = manilaDayNumber(due) - manilaDayNumber(now)
  if (days === 0) return `Due today, ${formatTime(due)}`
  if (days === 1) return "Due tomorrow"
  if (days > 1) return `Due in ${days} days`
  return `Due date: ${formatDate(due)}`
}
