// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { displayName, shortName } from "./names.ts"

test("a name typed in capitals is shown in normal case", () => {
  assert.equal(displayName("KHATRINA JOICE G. GONZALES"), "Khatrina Joice G. Gonzales")
  assert.equal(displayName("MARIE-CLAIRE O'NEIL III"), "Marie-Claire O'Neil III")
})

test("a name with lowercase letters is left as typed", () => {
  assert.equal(displayName("Juan dela Cruz"), "Juan dela Cruz")
  assert.equal(displayName("  Ana   McDonald "), "Ana McDonald")
})

test("the short name is the first name and surname", () => {
  assert.equal(shortName("KHATRINA JOICE G. GONZALES"), "Khatrina Gonzales")
  assert.equal(shortName("Juan Miguel Dela Cruz"), "Juan Dela Cruz")
  assert.equal(shortName("JOSE DE LOS SANTOS JR."), "Jose De Los Santos Jr.")
  assert.equal(shortName("Ana Reyes"), "Ana Reyes")
  assert.equal(shortName("Guest"), "Guest")
  assert.equal(shortName(""), "")
})
