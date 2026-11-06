// Manila (UTC+8, no daylight saving) dates for reports, as "YYYY-MM-DD".
// A date means that whole Manila day, 00:00 to 23:59:59; the API reads it
// the same way (apps/api/core/dates.py). No imports, so lib/manilaDates.test.ts
// can run with Node's own test runner.

export type DateRangePreset = "all" | "week" | "month" | "semester" | "custom"

const MANILA_OFFSET = "+08:00"
const DAY_MS = 24 * 60 * 60 * 1000

// Today's date in Manila, "YYYY-MM-DD".
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now)
}

// "YYYY-MM-DD" moved by whole days or months (calendar arithmetic, no time zone).
function shiftDate(day: string, { days = 0, months = 0 }: { days?: number; months?: number }): string {
  const [y, m, d] = day.split("-").map(Number)
  const shifted = new Date(Date.UTC(y, m - 1 + months, d + days))
  return shifted.toISOString().slice(0, 10)
}

// The instants a Manila date range covers: [start, end), in ms. Undefined
// ends are open.
export function manilaDayRangeMs(dateFrom?: string, dateTo?: string): { fromMs: number | null; toMs: number | null } {
  return {
    fromMs: dateFrom ? Date.parse(`${dateFrom}T00:00:00${MANILA_OFFSET}`) : null,
    toMs: dateTo ? Date.parse(`${dateTo}T00:00:00${MANILA_OFFSET}`) + DAY_MS : null,
  }
}

// Whether a moment (ms or an ISO timestamp) falls in a Manila date range.
export function inManilaDateRange(moment: number | string, dateFrom?: string, dateTo?: string): boolean {
  const t = typeof moment === "number" ? moment : new Date(moment).getTime()
  const { fromMs, toMs } = manilaDayRangeMs(dateFrom, dateTo)
  return (fromMs === null || t >= fromMs) && (toMs === null || t < toMs)
}

// "1 Nov 2026" for a "YYYY-MM-DD" Manila date.
export function formatManilaDate(day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Date(`${day}T12:00:00${MANILA_OFFSET}`).toLocaleDateString("en-PH", { ...opts, timeZone: "Asia/Manila" })
}

// Turns a date range choice into Manila dates ("YYYY-MM-DD"), both
// included. "all" means no limits. The presets end today: the last 7 days,
// the last month, the last 6 months (a semester).
export function resolveDateRange(
  preset: DateRangePreset, customFrom: string, customTo: string, now: Date = new Date(),
): { dateFrom?: string; dateTo?: string } {
  if (preset === "all") return {}
  if (preset === "custom") {
    return { dateFrom: customFrom || undefined, dateTo: customTo || undefined }
  }
  const today = manilaToday(now)
  const from =
    preset === "week" ? shiftDate(today, { days: -7 })
    : preset === "month" ? shiftDate(today, { months: -1 })
    : shiftDate(today, { months: -6 })
  return { dateFrom: from, dateTo: today }
}
