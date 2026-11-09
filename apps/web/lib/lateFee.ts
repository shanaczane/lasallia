// "Why this amount?" for a book returned late: each day after the due date,
// whether it was charged and why not, and the sum that gives the fine. A
// day is charged once the library has opened that day, so closed days and
// a day the book came back before opening are free.
// No imports from the app, so lib/lateFee.test.ts runs on its own.

import { formatTime } from "./dueDates.ts"

export type LateDayStatus = "charged" | "closed" | "before_opening"

export type LateFeeLoan = {
  due_date: string
  returned_at: string
  fine_amount: number
  // The two parts of fine_amount (null on older loans).
  overdue_fine_amount?: number | null
  damage_fine_amount?: number | null
  late_days?: { date: string; status: LateDayStatus }[] | null
  late_hours_charged?: number | null
  late_fee_rate?: number | null
  late_fee_cap?: number | null
}

/** One row of the table: a day (or a group of days) and what it cost. */
export type LateFeeLine = { label: string; amount: number | null; note?: string }

export type LateFeeBreakdown = {
  lines: LateFeeLine[]
  /** "2 days × ₱5.00 a day" */
  sumLabel: string
  subtotal: number
  /** The per-book cap, when it brought the fee down. */
  cap: number | null
  /** The late fee saved when the book came back. */
  recorded: number
  /** False when today's rate doesn't give the saved fee (Settings changed). */
  matches: boolean
}

// More days than this are summed up instead of listed one by one.
const MAX_LISTED_DAYS = 10

export const peso = (n: number) => `₱${n.toFixed(2)}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// "Saturday, October 10" for a plain YYYY-MM-DD date (no time zone shift).
function dayName(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  })
}

/** The late fee day by day, or null when the loan doesn't have what's needed. */
export function lateFeeBreakdown(l: LateFeeLoan): LateFeeBreakdown | null {
  // The late part of the saved fine: the recorded split, or the whole fine
  // on an older loan with no damage charge.
  const recorded = l.overdue_fine_amount ?? (l.damage_fine_amount ? null : l.fine_amount)
  const rate = l.late_fee_rate
  if (recorded == null || recorded <= 0 || rate == null) return null

  let lines: LateFeeLine[]
  let units: number
  let sumLabel: string

  if (l.late_hours_charged != null) {
    units = l.late_hours_charged
    lines = [{ label: `${units} library hour${units === 1 ? "" : "s"}`, amount: units * rate, note: "Only the hours the library was open count" }]
    sumLabel = `${units} hour${units === 1 ? "" : "s"} × ${peso(rate)} an hour`
  } else {
    const days = l.late_days ?? []
    if (days.length === 0) return null
    const charged = days.filter((d) => d.status === "charged")
    units = charged.length
    const beforeOpening = days.find((d) => d.status === "before_opening")
    const beforeOpeningNote = `Returned at ${formatTime(l.returned_at)}, before the library opened - not charged`

    if (days.length <= MAX_LISTED_DAYS) {
      lines = days.map((d) => ({
        label: dayName(d.date),
        amount: d.status === "charged" ? rate : null,
        note: d.status === "closed" ? "Library closed - not charged" : d.status === "before_opening" ? beforeOpeningNote : undefined,
      }))
    } else {
      const closed = days.filter((d) => d.status === "closed").length
      lines = [
        {
          label: plural(units, "library day"),
          amount: units * rate,
          note: units > 0 ? `${dayName(charged[0].date)} to ${dayName(charged[units - 1].date)}` : undefined,
        },
        ...(closed > 0 ? [{ label: plural(closed, "closed day"), amount: null, note: "Weekends and holidays - not charged" }] : []),
        ...(beforeOpening ? [{ label: dayName(beforeOpening.date), amount: null, note: beforeOpeningNote }] : []),
      ]
    }
    sumLabel = `${plural(units, "day")} × ${peso(rate)} a day`
  }

  const subtotal = Math.round(units * rate * 100) / 100
  const capped = l.late_fee_cap != null && subtotal > l.late_fee_cap
  const fee = capped ? l.late_fee_cap! : subtotal
  return {
    lines,
    sumLabel,
    subtotal,
    cap: capped ? l.late_fee_cap! : null,
    recorded,
    matches: Math.abs(fee - recorded) < 0.005,
  }
}
