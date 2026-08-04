// apps/web/lib/returns.ts
// Fetch layer for the librarian-side return flow (kiosk plan Phase 4):
// lookup, search, confirm return, reshelve. All authenticated as a
// librarian — RLS/require_librarian on the API side is the real boundary.

import { getToken } from "@/lib/auth"
import type { Book } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

export type Condition = "good" | "minor_wear" | "already_damaged"
export type ReturnCondition = "good" | "fair" | "damaged" | "incomplete"
export type FineStatus = "none" | "paid" | "unsettled"

export type Borrower = {
  full_name: string | null
  avatar_url: string | null
}

export type Loan = {
  id: string
  book_copy_id: string
  accession_number: string | null
  student_id: string
  station_session_id: string | null
  borrowed_at: string
  due_date: string
  returned_at: string | null
  status: "active" | "returned" | "overdue"
  condition_at_borrow: Condition
  purpose: string | null
  notes: string | null
  condition_at_return: ReturnCondition | null
  condition_notes: string | null
  fine_amount: number | null
  fine_status: FineStatus | null
  receipt_number: string | null
  books: Book | null
  profiles: Borrower | null
}

export type LoanLookupResult = Loan & {
  days_overdue: number
  preview_fine_amount: number
}

export async function lookupLoanByAccession(accessionNumber: string): Promise<LoanLookupResult> {
  const res = await fetch(`${API_URL}/loans/lookup?accession_number=${encodeURIComponent(accessionNumber)}`, {
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, "This copy isn't currently out on loan")
  return res.json()
}

export async function searchLoans(query: string): Promise<LoanLookupResult[]> {
  const res = await fetch(`${API_URL}/loans/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Search failed")
  return res.json()
}

export async function confirmReturn(
  loanId: string,
  params: {
    conditionAtReturn: ReturnCondition
    conditionNotes?: string
    replacementCost?: number
    fineSettlement?: "paid" | "unsettled"
    receiptNumber?: string
  }
): Promise<Loan> {
  const res = await fetch(`${API_URL}/loans/${loanId}/return`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      condition_at_return: params.conditionAtReturn,
      condition_notes: params.conditionNotes || undefined,
      replacement_cost: params.replacementCost ?? undefined,
      fine_settlement: params.fineSettlement ?? undefined,
      receipt_number: params.receiptNumber || undefined,
    }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not confirm this return")
  return res.json()
}

export async function reshelveCopy(accessionNumber: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_URL}/loans/reshelve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ accession_number: accessionNumber }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not reshelve this copy")
  return res.json()
}
