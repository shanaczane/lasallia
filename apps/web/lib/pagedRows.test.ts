// Run with: pnpm --filter web test   (Node's built-in test runner)
// Paging that resets on new rows must never loop. The Usage tab once reset
// its page during render by comparing `rows ?? []` with the previous rows;
// while loading that made a new [] every render and hit React's
// "Too many re-renders". These render with react-dom/server, which runs the
// same render-phase update limit.

import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement, useState } from "react"
import { renderToString } from "react-dom/server"

import { currentPage, usePagedRows } from "./pagedRows.ts"

type Row = { day: number }
const DAYS: Row[] = Array.from({ length: 30 }, (_, i) => ({ day: i + 1 }))

// Renders the component a second time, as the page does when its parent
// re-renders. (A server render otherwise renders once, and the loop starts
// on the second render.)
function useRenderTwice() {
  const [renders, setRenders] = useState(1)
  if (renders === 1) setRenders(2)
}

function Table({ rows }: { rows: Row[] | null }) {
  useRenderTwice()
  const { page, totalPages, paged } = usePagedRows(rows, 10)
  return createElement("p", null, `page ${page} of ${totalPages}: ${paged.map((r) => r.day).join(",")}`)
}

// The old Usage tab code, kept here only to show the test catches the loop.
function OldTable({ rows }: { rows: Row[] | null }) {
  useRenderTwice()
  const [, setPage] = useState(1)
  const current = rows ?? []
  const [prev, setPrev] = useState(current)
  if (current !== prev) {
    setPrev(current)
    setPage(1)
  }
  return createElement("p", null, String(current.length))
}

test("the old reset loops while loading (what the Usage tab did)", () => {
  assert.throws(() => renderToString(createElement(OldTable, { rows: null })), /Too many re-renders/)
})

test("rendering while loading (no rows yet) doesn't loop", () => {
  assert.equal(renderToString(createElement(Table, { rows: null })), "<p>page 1 of 1: </p>")
})

test("a new array on every render doesn't loop either", () => {
  function Unstable() {
    useRenderTwice()
    const { page, paged } = usePagedRows([...DAYS], 10)
    return createElement("p", null, `${page}:${paged.length}`)
  }
  assert.equal(renderToString(createElement(Unstable)), "<p>1:10</p>")
})

test("rows are paged", () => {
  assert.equal(renderToString(createElement(Table, { rows: DAYS })), "<p>page 1 of 3: 1,2,3,4,5,6,7,8,9,10</p>")
})

test("the page belongs to its rows: new rows start at 1, and it never passes the last page", () => {
  const other: Row[] = DAYS.slice(0, 5)
  assert.equal(currentPage({ rows: DAYS, page: 3 }, DAYS, 3), 3)
  assert.equal(currentPage({ rows: DAYS, page: 3 }, other, 1), 1)
  assert.equal(currentPage({ rows: DAYS, page: 3 }, null, 1), 1)
  assert.equal(currentPage({ rows: DAYS, page: 9 }, DAYS, 3), 3)
})
