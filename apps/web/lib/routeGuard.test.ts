// Run with: pnpm --filter web test   (Node's built-in test runner)

import { test } from "node:test"
import assert from "node:assert/strict"

import { guardRoute } from "./routeGuard.ts"

test("logged-out visitors go to the login page from both areas", () => {
  assert.equal(guardRoute("/librarian/catalog", undefined), "/login?next=%2Flibrarian%2Fcatalog")
  assert.equal(guardRoute("/user/library", undefined), "/login?next=%2Fuser%2Flibrary")
})

test("only librarians reach librarian pages", () => {
  assert.equal(guardRoute("/librarian/dashboard", "librarian"), null)
  assert.equal(guardRoute("/librarian/dashboard", "student"), "/user/dashboard")
  assert.equal(guardRoute("/librarian/dashboard", "faculty"), "/user/dashboard")
  assert.equal(guardRoute("/librarian/dashboard", "guest"), "/guest/dashboard")
})

test("only students and faculty reach user pages", () => {
  assert.equal(guardRoute("/user/library", "student"), null)
  assert.equal(guardRoute("/user/library", "faculty"), null)
  assert.equal(guardRoute("/user/library", "librarian"), "/librarian/dashboard")
  assert.equal(guardRoute("/user/library", "guest"), "/guest/dashboard")
})

test("a cookie with an unknown role can't loop, it goes to login", () => {
  assert.equal(guardRoute("/user/library", "admin"), "/login?next=%2Fuser%2Flibrary")
})

test("public pages are left alone", () => {
  for (const path of ["/guest/dashboard", "/kiosk", "/login", "/auth/callback", "/privacy", "/borrow/abc", "/"]) {
    assert.equal(guardRoute(path, undefined), null)
  }
})

test("a path that only starts the same way isn't in the area", () => {
  assert.equal(guardRoute("/users", undefined), null)
})
