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

// Set on the POST /loans/{id}/return response only — tells the Return
// tab which way the copy was just routed so it can point the librarian
// at the right next step (Reshelving queue vs. already held for a
// reservation) without a second request.
export type ReturnedLoan = Loan & { needs_reshelving: boolean }

// GET /loans/reshelving-queue — the Reshelving tab's browse list, same
// idea as listActiveLoans/"Active Borrowers" above.
export type ReshelvingQueueItem = {
  id: string // book_copies.id
  accession_number: string | null
  books: Book | null
  returned_at: string | null
}

// Powers the Return tab's "Active Borrowers" list — the same GET /loans
// every other librarian screen already uses (RLS: librarians see every
// loan), just filtered down to what's still out. Browsing this list is a
// shortcut to *finding* who has what; it still routes through
// lookupLoanByAccession (same accession_number the row already carries)
// rather than skipping that verification step.
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

// Powers the Reshelving tab's browse list — same "pick it instead of
// typing an accession number" convenience listActiveLoans gives Return.
export async function fetchReshelvingQueue(): Promise<ReshelvingQueueItem[]> {
  const res = await fetch(`${API_URL}/loans/reshelving-queue`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load the reshelving queue")
  return res.json()
}

// GET /loans/reshelved — already-reshelved copies (book_copies.reshelved_at
// set), distinct from fetchReshelvingQueue's still-awaiting-reshelving list.
export type ReshelvedItem = {
  id: string // book_copies.id
  accession_number: string | null
  books: Book | null
  reshelved_at: string
}

// Borrow & Return's "Borrowed/Returned Today" lists — real data instead of
// browser-memory state, so it survives a refresh and resets only when the
// caller's own day-boundary does. The caller computes that boundary (see
// todayRangeIso in borrow-return/page.tsx) rather than this guessing a
// timezone server-side.
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

// "Reshelved Today" — same day-boundary convention as fetchLoansInRange.
export async function fetchReshelvedInRange(filters: { reshelvedFrom?: string; reshelvedTo?: string }): Promise<ReshelvedItem[]> {
  const params = new URLSearchParams()
  if (filters.reshelvedFrom) params.set("reshelved_from", filters.reshelvedFrom)
  if (filters.reshelvedTo) params.set("reshelved_to", filters.reshelvedTo)
  const res = await fetch(`${API_URL}/loans/reshelved?${params.toString()}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load reshelved copies")
  return res.json()
}
