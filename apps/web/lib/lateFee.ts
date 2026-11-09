// "Why this amount?" for a book returned late: which days were charged and
// the sum that gives the fine. The fine counts only days the library was
// open, so it can be fewer than the calendar days late; this says so.
// No imports from the app, so lib/lateFee.test.ts runs on its own.

import { calendarDaysBetween, formatDate } from "./dueDates.ts"

export type LateFeeLoan = {
  due_date: string
  returned_at: string
  // The late part of the stored fine (null on older loans, which only have
  // fine_amount).
  overdue_fine_amount?: number | null
  fine_amount: number
  damage_fine_amount?: number | null
  late_days_charged?: string[] | null
  late_hours_charged?: number | null
  late_fee_rate?: number | null
  late_fee_cap?: number | null
}

export type LateFeeRow = { label: string; value: string }

const peso = (n: number) => `₱${n.toFixed(2)}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// "Monday, October 12" for a plain YYYY-MM-DD date (no time zone shift).
function dayName(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  })
}

function listDays(days: string[]): string {
  if (days.length > 4) return `${dayName(days[0])} to ${dayName(days[days.length - 1])}`
  const names = days.map(dayName)
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export function lateFeeRows(l: LateFeeLoan): LateFeeRow[] {
  const calendarDays = Math.max(0, calendarDaysBetween(l.due_date, l.returned_at))
  const rows: LateFeeRow[] = [{
    label: "Returned",
    value: calendarDays > 0
      ? `${formatDate(l.returned_at)} - ${plural(calendarDays, "day")} after the due date`
      : `${formatDate(l.returned_at)} - after the due time`,
  }]

  // The late part of the fine: the recorded split, or the whole fine on an
  // older loan with no damage charge.
  const lateFee = l.overdue_fine_amount ?? (l.damage_fine_amount ? null : l.fine_amount)
  const rate = l.late_fee_rate
  if (lateFee == null || lateFee <= 0 || rate == null) return rows

  const matches = (n: number) => Math.abs(n - lateFee) < 0.005
  const capNote = (raw: number) =>
    l.late_fee_cap != null && raw > l.late_fee_cap && matches(l.late_fee_cap)
      ? `, capped at ${peso(l.late_fee_cap)} per book`
      : ""

  if (l.late_hours_charged != null) {
    const hours = l.late_hours_charged
    const raw = Math.round(hours * rate * 100) / 100
    rows.push({ label: "Hours charged", value: `${hours} library hour${hours === 1 ? "" : "s"} - only the hours the library was open count` })
    if (matches(raw) || capNote(raw)) {
      rows.push({ label: "Late fee", value: `${hours} × ${peso(rate)} an hour = ${peso(raw)}${capNote(raw)}` })
    }
    return rows
  }

  const days = l.late_days_charged ?? []
  if (days.length === 0) return rows
  const skipped = calendarDays - days.length
  rows.push({
    label: "Days charged",
    value: `${plural(days.length, "library day")} (${listDays(days)})`
      + (skipped > 0 ? `. The other ${plural(skipped, "day")} the library was closed (weekends and holidays), so ${skipped === 1 ? "it isn't" : "they aren't"} charged.` : ""),
  })
  const raw = Math.round(days.length * rate * 100) / 100
  // Only show the sum when today's rate gives the recorded fine; the rate
  // may have changed since the book came back.
  if (matches(raw) || capNote(raw)) {
    rows.push({ label: "Late fee", value: `${plural(days.length, "day")} × ${peso(rate)} a day = ${peso(raw)}${capNote(raw)}` })
  }
  return rows
}
