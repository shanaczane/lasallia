// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { ROLE_LABEL, roleLine } from "./roles.ts"

test("a student shows their college and year level", () => {
  assert.equal(roleLine("student", { college: "CITE", yearLevel: 3 }), "Student · CITE · 3rd Year")
})

test("a student with an unfinished profile leaves out what's missing", () => {
  assert.equal(roleLine("student"), "Student")
  assert.equal(roleLine("student", { college: "CON", yearLevel: null }), "Student · CON")
  assert.equal(roleLine("student", { college: null, yearLevel: 1 }), "Student · 1st Year")
})

test("faculty show the full label and no college", () => {
  assert.equal(roleLine("faculty", { college: "CITE", yearLevel: 2 }), "Faculty/Lasallian Partner")
})

test("a librarian shows the active profile", () => {
  assert.equal(roleLine("librarian", { profileName: "John Doe" }), "Librarian · John Doe")
  assert.equal(roleLine("librarian"), "Librarian")
})

test("a guest is just a guest", () => {
  assert.equal(roleLine("guest"), "Guest")
})

test("the four user types keep their names", () => {
  assert.deepEqual(Object.keys(ROLE_LABEL).sort(), ["faculty", "guest", "librarian", "student"])
})
