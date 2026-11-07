// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { hasErrors, rejectionReasonProblem, tooManyFiles, validateRequestForm } from "./bookRequestForm.ts"

const GOOD = { title: "Clean Code", author: "Robert Martin", isbn: "", copies: 2, course: "CS 302" }

test("a complete form has no errors", () => {
  assert.equal(hasErrors(validateRequestForm(GOOD, 10)), false)
})

test("each required field gets its own message", () => {
  const errors = validateRequestForm({ ...GOOD, title: " ", author: "", course: "  " }, 10)
  assert.equal(errors.title, "Title is required")
  assert.equal(errors.author, "Author is required")
  assert.equal(errors.course, "Related course is required")
})

test("copies must be whole and inside the limit", () => {
  for (const copies of [0, -1, 11, 1.5]) {
    assert.equal(validateRequestForm({ ...GOOD, copies }, 10).copies, "Copies must be a whole number from 1 to 10")
  }
  assert.equal(validateRequestForm({ ...GOOD, copies: 10 }, 10).copies, undefined)
})

test("the limit comes from settings", () => {
  assert.equal(validateRequestForm({ ...GOOD, copies: 4 }, 3).copies, "Copies must be a whole number from 1 to 3")
})

test("ISBN is optional, but checked when typed", () => {
  assert.equal(validateRequestForm({ ...GOOD, isbn: "978-0-13-235088-4" }, 10).isbn, undefined)
  assert.equal(validateRequestForm({ ...GOOD, isbn: "0-306-40615-2" }, 10).isbn, undefined)
  assert.equal(validateRequestForm({ ...GOOD, isbn: "080442957X" }, 10).isbn, undefined)
  assert.ok(validateRequestForm({ ...GOOD, isbn: "978-0-13-235088-5" }, 10).isbn)
  assert.ok(validateRequestForm({ ...GOOD, isbn: "123" }, 10).isbn)
})

test("five files are allowed, counting ones already attached", () => {
  assert.equal(tooManyFiles(0, 5), null)
  assert.equal(tooManyFiles(4, 2), "A request can have at most 5 files")
})

test("a rejection reason needs 10 characters after trimming", () => {
  assert.equal(rejectionReasonProblem("0123456789"), null)
  assert.ok(rejectionReasonProblem("  too short  "))
})
