// Run with: pnpm --filter web test   (Node's built-in test runner)
// A report date is the whole Manila day: from 00:00 to 23:59:59 in Manila.

import { test } from "node:test"
import assert from "node:assert/strict"

import { formatManilaDate, inManilaDateRange, manilaDayRangeMs, manilaToday, resolveDateRange } from "./manilaDates.ts"

test("the first and last day of a range are whole Manila days", () => {
  const from = "2026-11-01"
  const to = "2026-11-30"
  // 1 Nov 00:00 Manila = 31 Oct 16:00 UTC; 30 Nov 23:59:59 Manila = 30 Nov 15:59:59 UTC.
  assert.equal(inManilaDateRange("2026-10-31T15:59:59Z", from, to), false)
  assert.equal(inManilaDateRange("2026-10-31T16:00:00Z", from, to), true)
  assert.equal(inManilaDateRange("2026-11-30T15:59:59.999Z", from, to), true)
  assert.equal(inManilaDateRange("2026-11-30T16:00:00Z", from, to), false)
})

test("a one-day range covers the whole day", () => {
  assert.equal(inManilaDateRange("2026-11-14T16:00:00Z", "2026-11-15", "2026-11-15"), true)
  assert.equal(inManilaDateRange("2026-11-15T15:59:59Z", "2026-11-15", "2026-11-15"), true)
  assert.equal(inManilaDateRange("2026-11-15T16:00:00Z", "2026-11-15", "2026-11-15"), false)
})

test("open ends and millisecond bounds", () => {
  assert.equal(inManilaDateRange("1999-01-01T00:00:00Z", undefined, "2026-11-30"), true)
  assert.equal(inManilaDateRange("2099-01-01T00:00:00Z", "2026-11-01", undefined), true)
  assert.deepEqual(manilaDayRangeMs("2026-11-01", "2026-11-01"), {
    fromMs: Date.parse("2026-10-31T16:00:00Z"),
    toMs: Date.parse("2026-11-01T16:00:00Z"),
  })
})

test("custom dates are sent as typed, not shifted to UTC", () => {
  assert.deepEqual(resolveDateRange("custom", "2026-11-01", "2026-11-30"), { dateFrom: "2026-11-01", dateTo: "2026-11-30" })
  assert.deepEqual(resolveDateRange("custom", "", ""), { dateFrom: undefined, dateTo: undefined })
  assert.deepEqual(resolveDateRange("all", "2026-11-01", "2026-11-30"), {})
})

test("presets end on today's Manila date", () => {
  // 30 Nov 17:00 UTC is already 1 Dec in Manila.
  const now = new Date("2026-11-30T17:00:00Z")
  assert.equal(manilaToday(now), "2026-12-01")
  assert.deepEqual(resolveDateRange("week", "", "", now), { dateFrom: "2026-11-24", dateTo: "2026-12-01" })
  assert.deepEqual(resolveDateRange("month", "", "", now), { dateFrom: "2026-11-01", dateTo: "2026-12-01" })
  assert.deepEqual(resolveDateRange("semester", "", "", now), { dateFrom: "2026-06-01", dateTo: "2026-12-01" })
})

test("dates show as the Manila day", () => {
  assert.equal(formatManilaDate("2026-11-01"), "Nov 1, 2026")
})
