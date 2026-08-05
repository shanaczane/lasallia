// apps/web/lib/inhouse.ts
// Fetch layer for the librarian-side guest / in-house loan flow (kiosk
// plan Phase 7). Entirely librarian-driven — a guest never calls any of
// this themselves, they have no session and no JWT.

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

export type VisitorType = "nocei" | "non_nocei"
export type Purpose = "library_use" | "photocopy"

export type InHouseLoan = {
  id: string
  book_copy_id: string
  accession_number: string | null
  librarian_id: string
  guest_name: string
  guest_id_number: string
  visitor_type: VisitorType
  fee_paid: boolean
  purpose: Purpose
  checked_out_at: string
  returned_at: string | null
  status: "active" | "returned"
  notes: string | null
  books: Book | null
}

export async function fetchInHouseLoans(status?: "active" | "returned"): Promise<InHouseLoan[]> {
  const qs = status ? `?status_filter=${status}` : ""
  const res = await fetch(`${API_URL}/in-house-loans${qs}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load in-house loans")
  return res.json()
}

export async function createInHouseLoan(params: {
  accessionNumber: string
  guestName: string
  guestIdNumber: string
  visitorType: VisitorType
  feePaid: boolean
  purpose: Purpose
  notes?: string
}): Promise<InHouseLoan> {
  const res = await fetch(`${API_URL}/in-house-loans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      accession_number: params.accessionNumber,
      guest_name: params.guestName,
      guest_id_number: params.guestIdNumber,
      visitor_type: params.visitorType,
      fee_paid: params.feePaid,
      purpose: params.purpose,
      notes: params.notes || undefined,
    }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not check out this item")
  return res.json()
}

export async function returnInHouseLoan(id: string): Promise<InHouseLoan> {
  const res = await fetch(`${API_URL}/in-house-loans/${id}/return`, {
    method: "POST",
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not confirm this return")
  return res.json()
}
