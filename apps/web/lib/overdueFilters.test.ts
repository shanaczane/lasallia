// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { dueLabel, formatDate, formatDateTime, formatTime } from "./dueDates.ts"
import { matchesOverdueFilters, type OverdueFilters } from "./overdueFilters.ts"

const ALL: OverdueFilters = { userType: "all", collectionType: "all", range: "all" }
const row = { role: "student", collectionType: "General", daysOverdue: 5 }

test("no filters keep every row", () => {
  assert.equal(matchesOverdueFilters(row, ALL), true)
})

test("user type", () => {
  assert.equal(matchesOverdueFilters(row, { ...ALL, userType: "student" }), true)
  assert.equal(matchesOverdueFilters(row, { ...ALL, userType: "faculty" }), false)
})

test("collection type", () => {
  assert.equal(matchesOverdueFilters(row, { ...ALL, collectionType: "Reserve" }), false)
})

test("overdue range, both ends included", () => {
  assert.equal(matchesOverdueFilters({ ...row, daysOverdue: 4 }, { ...ALL, range: "4-7" }), true)
  assert.equal(matchesOverdueFilters({ ...row, daysOverdue: 7 }, { ...ALL, range: "4-7" }), true)
  assert.equal(matchesOverdueFilters({ ...row, daysOverdue: 8 }, { ...ALL, range: "4-7" }), false)
  assert.equal(matchesOverdueFilters({ ...row, daysOverdue: 99 }, { ...ALL, range: "31+" }), true)
})

test("an item overdue today sits in the shortest range", () => {
  assert.equal(matchesOverdueFilters({ ...row, daysOverdue: 0 }, { ...ALL, range: "1-3" }), true)
})

test("dates and times are written one way, in Manila time", () => {
  // 09:00 UTC is 5:00 PM in Manila; 20:00 UTC is already the next day there.
  assert.equal(formatDate("2026-11-14T09:00:00Z"), "November 14, 2026")
  assert.equal(formatDate("2026-11-13T20:00:00Z"), "November 14, 2026")
  assert.equal(formatTime("2026-11-14T09:00:00Z"), "5:00 PM")
  assert.equal(formatDateTime("2026-11-14T09:00:00Z"), "November 14, 2026, 5:00 PM")
})

test("a missing date is blank", () => {
  assert.equal(formatDate(null), "")
  assert.equal(formatDateTime(undefined), "")
})

test("due labels count Manila days", () => {
  const now = new Date("2026-11-10T00:00:00Z") // 8:00 AM Tuesday in Manila
  assert.equal(dueLabel("2026-11-10T10:00:00Z", now), "Due today, 6:00 PM")
  assert.equal(dueLabel("2026-11-11T10:00:00Z", now), "Due tomorrow")
  assert.equal(dueLabel("2026-11-13T10:00:00Z", now), "Due in 3 days")
  assert.equal(dueLabel("2026-11-09T10:00:00Z", now), "Due date: November 9, 2026")
})

test("just after midnight in Manila is already the next day", () => {
  const now = new Date("2026-11-09T16:30:00Z") // 12:30 AM Tuesday in Manila
  assert.equal(dueLabel("2026-11-10T10:00:00Z", now), "Due today, 6:00 PM")
})
