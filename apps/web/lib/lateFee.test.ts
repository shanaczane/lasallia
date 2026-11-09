// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { lateFeeRows, type LateFeeLoan } from "./lateFee.ts"

// Due Friday October 9 at 5:00 PM, returned Tuesday October 13 in the
// morning: 4 calendar days, but the weekend isn't charged.
const LOAN: LateFeeLoan = {
  due_date: "2026-10-09T09:00:00+00:00",
  returned_at: "2026-10-13T01:30:00+00:00",
  fine_amount: 10,
  overdue_fine_amount: 10,
  damage_fine_amount: 0,
  late_days_charged: ["2026-10-12", "2026-10-13"],
  late_hours_charged: null,
  late_fee_rate: 5,
  late_fee_cap: 100,
}

const value = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value

test("counts calendar days on Manila dates, not hours", () => {
  assert.equal(value(lateFeeRows(LOAN), "Returned"), "October 13, 2026 - 4 days after the due date")
})

test("names the days charged and says why the others weren't", () => {
  assert.equal(
    value(lateFeeRows(LOAN), "Days charged"),
    "2 library days (Monday, October 12 and Tuesday, October 13). "
      + "The other 2 days the library was closed (weekends and holidays), so they aren't charged.",
  )
})

test("shows the sum that gives the fine", () => {
  assert.equal(value(lateFeeRows(LOAN), "Late fee"), "2 days × ₱5.00 a day = ₱10.00")
})

test("no closed days: no note about them", () => {
  const rows = lateFeeRows({ ...LOAN, due_date: "2026-10-12T09:00:00+00:00", late_days_charged: ["2026-10-13"], overdue_fine_amount: 5, fine_amount: 5 })
  assert.equal(value(rows, "Days charged"), "1 library day (Tuesday, October 13)")
})

test("leaves the sum out when today's rate doesn't give the recorded fine", () => {
  const rows = lateFeeRows({ ...LOAN, late_fee_rate: 7 })
  assert.equal(value(rows, "Late fee"), undefined)
  assert.ok(value(rows, "Days charged"))
})

test("says when the per-book cap applied", () => {
  const days = Array.from({ length: 25 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`)
  const rows = lateFeeRows({ ...LOAN, late_days_charged: days, overdue_fine_amount: 100, fine_amount: 100 })
  assert.equal(value(rows, "Late fee"), "25 days × ₱5.00 a day = ₱125.00, capped at ₱100.00 per book")
})

test("hourly collections show library hours", () => {
  const rows = lateFeeRows({ ...LOAN, late_days_charged: [], late_hours_charged: 3.5, late_fee_rate: 2, overdue_fine_amount: 7, fine_amount: 7 })
  assert.equal(value(rows, "Late fee"), "3.5 × ₱2.00 an hour = ₱7.00")
})
