// Run with: pnpm --filter web test   (Node's built-in test runner)
// Guests' in-house loans in the Activity Log and Circulation feeds.

import { test } from "node:test"
import assert from "node:assert/strict"

import { TX_CONFIG, inHouseFeed, isInHouse } from "./activity.ts"
import type { InHouseLoan } from "./inhouse.ts"

function guestLoan(id: string, checkedOut: string, returned: string | null): InHouseLoan {
  return {
    id, book_copy_id: "copy-1", accession_number: "T45000", librarian_id: "lib-1",
    guest_name: "Pedro Visitor", guest_id_number: "GUEST-ID-7781", visitor_type: "non_nocei", fee_paid: true,
    receipt_number: "OR-9", purpose: "library_use", checked_out_at: checkedOut, returned_at: returned,
    status: returned ? "returned" : "active", notes: "private note",
    books: { id: "book-1", title: "Clean code" } as InHouseLoan["books"],
  }
}

test("a returned guest loan is a checkout and a return, newest first", () => {
  const feed = inHouseFeed([
    guestLoan("a", "2026-11-03T01:00:00Z", "2026-11-03T06:00:00Z"),
    guestLoan("b", "2026-11-12T02:00:00Z", null),
  ])
  assert.deepEqual(feed.map((f) => [f.id, f.type]), [
    ["inhouse-checkout-b", "inhouse_checkout"],
    ["inhouse-return-a", "inhouse_return"],
    ["inhouse-checkout-a", "inhouse_checkout"],
  ])
  assert.equal(feed[0].item, "Clean code")
  assert.equal(feed[0].userId, null)
  assert.equal(feed[1].timestamp, Date.parse("2026-11-03T06:00:00Z"))
})

test("only the guest's name is shown, never their ID number or notes", () => {
  const [item] = inHouseFeed([guestLoan("a", "2026-11-03T01:00:00Z", null)])
  assert.equal(item.user, "Pedro Visitor (guest)")
  const shown = JSON.stringify(item)
  for (const hidden of ["GUEST-ID-7781", "private note", "OR-9", "T45000"]) assert.ok(!shown.includes(hidden), hidden)
})

test("in-house types have labels and are told apart from student loans", () => {
  assert.equal(TX_CONFIG.inhouse_checkout.label, "In-house checkout")
  assert.equal(TX_CONFIG.inhouse_return.label, "In-house return")
  assert.ok(isInHouse("inhouse_return") && !isInHouse("checkout") && !isInHouse("reserve"))
})
