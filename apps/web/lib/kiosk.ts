// apps/web/lib/kiosk.ts
// Fetch layer for the borrow/return kiosk flow: station sessions, holds,
// and loans. /holds/{token} and /loans are token-authorized, not JWT-
// authorized — the token itself is the credential (see apps/api's
// routers/holds.py, routers/loans.py), since the phone that scans the QR
// is a second, separate, unauthenticated device.

import { getToken } from '@/lib/auth'
import type { Book } from '@lasallia/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export type StationSession = {
  id: string
  student_id: string
  auth_method: 'manual_login' | 'rfid'
  station_id: string
  started_at: string
  ended_at: string | null
}

// The student is already logged into the web portal — reuses that JWT
// rather than asking them to retype their password.
export async function openSessionFromToken(): Promise<StationSession> {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${API_URL}/station-sessions/from-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not open a borrowing session')
  return res.json()
}

export type ClaimHoldResponse = {
  token: string
  expires_at: string
  qr_url: string
}

export async function claimHold(bookId: string, stationSessionId: string): Promise<ClaimHoldResponse> {
  const res = await fetch(`${API_URL}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book_id: bookId, station_session_id: stationSessionId }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'No copies available to borrow right now')
  return res.json()
}

export async function releaseHold(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/holds/${token}/release`, { method: 'POST' })
  if (!res.ok && res.status !== 404) return parseErrorOrThrow(res, 'Could not release the hold')
}

export type HoldDetail = {
  token: string
  expires_at: string
  book: {
    id: string
    title: string
    author: string
    cover_url?: string
    cover_color?: string
    call_number: string
    shelf_location: string
    format?: string
    category: string
  }
  student_first_name: string
  active_loan_count: number
  due_date_preview: string
}

export async function fetchHold(token: string): Promise<HoldDetail> {
  const res = await fetch(`${API_URL}/holds/${token}`)
  if (!res.ok) return parseErrorOrThrow(res, 'This hold could not be found')
  return res.json()
}

export type Condition = 'good' | 'minor_wear' | 'already_damaged'

export type Loan = {
  id: string
  book_copy_id: string
  student_id: string
  station_session_id: string | null
  borrowed_at: string
  due_date: string
  returned_at: string | null
  status: 'active' | 'returned' | 'overdue'
  condition_at_borrow: Condition
  purpose: string | null
  notes: string | null
  books: Book | null
}

// Authenticated, unlike the rest of this file — this is the student
// reading their own history, not a kiosk-flow write. RLS (0009) scopes it:
// students see their own loans, librarians see all.
export async function fetchLoans(): Promise<Loan[]> {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  const res = await fetch(`${API_URL}/loans`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load your loans')
  return res.json()
}

export async function confirmLoan(params: {
  token: string
  accessionNumber: string
  condition: Condition
  purpose?: string
  notes?: string
}): Promise<Loan> {
  const res = await fetch(`${API_URL}/loans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: params.token,
      accession_number: params.accessionNumber,
      condition: params.condition,
      purpose: params.purpose || undefined,
      notes: params.notes || undefined,
    }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not confirm this loan')
  return res.json()
}
