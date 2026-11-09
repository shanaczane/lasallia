// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { lateFeeBreakdown, type LateFeeLoan } from "./lateFee.ts"

// Due Friday October 9 at 2:05 PM, returned Tuesday October 13 at 12:49 AM,
// before the library opened: Saturday and Monday are charged.
const LOAN: LateFeeLoan = {
  due_date: "2026-10-09T06:05:00+00:00",
  returned_at: "2026-10-12T16:49:00+00:00",
  fine_amount: 10,
  overdue_fine_amount: null,
  damage_fine_amount: null,
  late_days: [
    { date: "2026-10-10", status: "charged" },
    { date: "2026-10-11", status: "closed" },
    { date: "2026-10-12", status: "charged" },
    { date: "2026-10-13", status: "before_opening" },
  ],
  late_hours_charged: null,
  late_fee_rate: 5,
  late_fee_cap: 100,
}

test("lists every day with what it cost and why the free ones were free", () => {
  assert.deepEqual(lateFeeBreakdown(LOAN)!.lines, [
    { label: "Saturday, October 10", amount: 5, note: undefined },
    { label: "Sunday, October 11", amount: null, note: "Library closed - not charged" },
    { label: "Monday, October 12", amount: 5, note: undefined },
    { label: "Tuesday, October 13", amount: null, note: "Returned at 12:49 AM, before the library opened - not charged" },
  ])
})

test("the sum gives the recorded fine", () => {
  const b = lateFeeBreakdown(LOAN)!
  assert.equal(b.sumLabel, "2 days × ₱5.00 a day")
  assert.equal(b.subtotal, 10)
  assert.equal(b.matches, true)
  assert.equal(b.cap, null)
})

test("flags a fine that today's rate doesn't give", () => {
  const b = lateFeeBreakdown({ ...LOAN, late_fee_rate: 7 })!
  assert.equal(b.matches, false)
  assert.equal(b.recorded, 10)
})

test("long overdue periods are summed up, with the cap", () => {
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    status: (i % 7 === 3 ? "closed" : "charged") as "closed" | "charged",
  }))
  const b = lateFeeBreakdown({ ...LOAN, late_days: days, fine_amount: 100 })!
  assert.equal(b.lines[0].label, "26 library days")
  assert.equal(b.lines[1].label, "4 closed days")
  assert.equal(b.subtotal, 130)
  assert.equal(b.cap, 100)
  assert.equal(b.matches, true)
})

test("hourly collections count library hours", () => {
  const b = lateFeeBreakdown({ ...LOAN, late_days: null, late_hours_charged: 3.5, late_fee_rate: 2, fine_amount: 7 })!
  assert.equal(b.sumLabel, "3.5 hours × ₱2.00 an hour")
  assert.equal(b.matches, true)
})

test("an older loan with a damage charge but no split has no breakdown", () => {
  assert.equal(lateFeeBreakdown({ ...LOAN, damage_fine_amount: 50 }), null)
})
