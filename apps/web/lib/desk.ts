// The desk's ID tap (librarians only): who the borrower is, what they have
// out, what they owe and what's ready to pick up.

import { getToken } from "@/lib/auth"
import type { LoanLookupResult } from "@/lib/returns"
import type { Loan, ReadyPickup } from "@/lib/kiosk"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type DeskPatron = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  program: string | null
  open_loans: LoanLookupResult[]
  unpaid_fines: Loan[]
  ready_pickups: ReadyPickup[]
  // Library Settings: fine payments and pickups need this tap.
  require_id_tap: boolean
}

export async function identifyPatron(rfidUid: string): Promise<DeskPatron> {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  const res = await fetch(`${API_URL}/desk/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rfid_uid: rfidUid }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === "string" ? body.detail : "Could not identify that ID")
  }
  return res.json()
}
