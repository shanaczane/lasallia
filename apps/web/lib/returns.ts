// API calls for returns and reshelving (librarians only).

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

// The return response: needs_reshelving is false if the copy is held for
// a reservation.
export type ReturnedLoan = Loan & { needs_reshelving: boolean }

// A copy waiting to be reshelved.
export type ReshelvingQueueItem = {
  id: string // book_copies.id
  accession_number: string | null
  books: Book | null
  returned_at: string | null
}

// Loans still out, for the Return tab's "Active Borrowers" list.
export async function listActiveLoans(): Promise<Loan[]> {
  const res = await fetch(`${API_URL}/loans`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load active loans")
  const loans: Loan[] = await res.json()
  return loans
    .filter((l) => l.status === "active" || l.status === "overdue")
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
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
): Promise<ReturnedLoan> {
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

// Copies waiting to be reshelved.
export async function fetchReshelvingQueue(): Promise<ReshelvingQueueItem[]> {
  const res = await fetch(`${API_URL}/loans/reshelving-queue`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load the reshelving queue")
  return res.json()
}

// A copy that has been reshelved.
export type ReshelvedItem = {
  id: string // book_copies.id
  accession_number: string | null
  books: Book | null
  reshelved_at: string
}

// Loans borrowed or returned in a time range ("Today" lists). The caller
// works out the day's start and end.
export async function fetchLoansInRange(filters: {
  borrowedFrom?: string
  borrowedTo?: string
  returnedFrom?: string
  returnedTo?: string
}): Promise<Loan[]> {
  const params = new URLSearchParams()
  if (filters.borrowedFrom) params.set("borrowed_from", filters.borrowedFrom)
  if (filters.borrowedTo) params.set("borrowed_to", filters.borrowedTo)
  if (filters.returnedFrom) params.set("returned_from", filters.returnedFrom)
  if (filters.returnedTo) params.set("returned_to", filters.returnedTo)
  const res = await fetch(`${API_URL}/loans?${params.toString()}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load loans")
  return res.json()
}

// Copies reshelved in a time range.
export async function fetchReshelvedInRange(filters: { reshelvedFrom?: string; reshelvedTo?: string }): Promise<ReshelvedItem[]> {
  const params = new URLSearchParams()
  if (filters.reshelvedFrom) params.set("reshelved_from", filters.reshelvedFrom)
  if (filters.reshelvedTo) params.set("reshelved_to", filters.reshelvedTo)
  const res = await fetch(`${API_URL}/loans/reshelved?${params.toString()}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load reshelved copies")
  return res.json()
}
