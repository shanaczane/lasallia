// API calls for borrowing: kiosk sessions, holds and loans. The phone that
// opens a hold's QR link must be signed in as the borrower; the kiosk itself
// has no login and identifies itself with its session id.

import { getToken } from '@/lib/auth'
import type { Book, UserRole } from '@lasallia/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// No response at all (API down, no signal, timeout). Pages offer "Try again"
// for this, since retrying can work.
export class NetworkError extends Error {}

// So a request on a weak signal can't hang forever.
const REQUEST_TIMEOUT_MS = 20_000

// fetch() with a timeout, turning "Failed to fetch" into a clear message.
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch {
    throw new NetworkError(
      controller.signal.aborted
        ? 'The library server is taking too long to respond. Please try again.'
        : "Can't reach the library server — check your internet connection and try again."
    )
  } finally {
    clearTimeout(timer)
  }
}

// 401: the phone isn't signed in (or the login ran out), so sign in first.
export class SignInRequiredError extends Error {}
// 403: signed in, but not as the borrower.
export class NotYourBorrowError extends Error {}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  // Validation errors (422) send detail as a list, not text.
  const message = typeof body.detail === 'string' ? body.detail : fallback
  if (res.status === 401) throw new SignInRequiredError('Please sign in to continue')
  if (res.status === 403) throw new NotYourBorrowError(message)
  throw new Error(message)
}

// The signed-in user's login, if any (the kiosk has none).
function optionalAuth(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type StationSession = {
  id: string
  student_id: string
  student_first_name: string
  // For the account badge; greetings use student_first_name.
  student_full_name: string
  auth_method: 'manual_login' | 'rfid' | 'librarian_assisted'
  station_id: string
  started_at: string
  ended_at: string | null
  // For the kiosk's "For you" tab.
  program: string | null
  college: string | null
  // For the user type shown on the kiosk and at the desk. Missing on
  // sessions saved before this was added.
  role?: UserRole
  year_level?: number | null
  // Shown on the kiosk after the tap. Missing on sessions saved before
  // this was added.
  ready_pickups?: ReadyPickup[]
  unpaid_fines_total?: number
  unpaid_fines_count?: number
  overdue_count?: number
}

export type ReadyPickup = {
  reservation_id: string
  book_id: string
  title: string
  author: string | null
  pickup_by: string | null
}

// Opens a session for a student already logged into the web portal.
export async function openSessionFromToken(): Promise<StationSession> {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  const res = await apiFetch(`${API_URL}/station-sessions/from-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not open a borrowing session')
  return res.json()
}

// Opens a kiosk session from an ID tap (no token needed). librarian_assisted
// sends the librarian's login instead.
export async function openSession(
  stationId: string,
  auth:
    | { authMethod: 'rfid'; rfidUid: string }
    | { authMethod: 'librarian_assisted'; studentId: string }
): Promise<StationSession> {
  const body =
    auth.authMethod === 'rfid'
      ? { station_id: stationId, auth_method: 'rfid', rfid_uid: auth.rfidUid }
      : { station_id: stationId, auth_method: 'librarian_assisted', student_id: auth.studentId }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth.authMethod === 'librarian_assisted') {
    const token = getToken()
    if (!token) throw new Error('Not signed in')
    headers.Authorization = `Bearer ${token}`
  }

  const res = await apiFetch(`${API_URL}/station-sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not open a session')
  return res.json()
}

// Ends a kiosk session (timeout, "Done", or a new tap).
export async function endSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/station-sessions/${sessionId}/end`, { method: 'POST' })
  if (!res.ok && res.status !== 404) return parseErrorOrThrow(res, 'Could not end this session')
}

export type ClaimHoldResponse = {
  token: string
  expires_at: string
  // Count down from this, not expires_at, in case the device clock is wrong.
  seconds_left: number
  qr_url: string
}

export async function claimHold(bookId: string, stationSessionId: string): Promise<ClaimHoldResponse> {
  const res = await apiFetch(`${API_URL}/holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ book_id: bookId, station_session_id: stationSessionId }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'No copies are available to borrow right now')
  return res.json()
}

export type BorrowEligibility = { can_borrow: boolean; reason: string | null }

// Whether the student can borrow, so the kiosk can explain why not.
export async function fetchBorrowEligibility(bookId: string, stationSessionId: string): Promise<BorrowEligibility> {
  const params = new URLSearchParams({ book_id: bookId, station_session_id: stationSessionId })
  const res = await apiFetch(`${API_URL}/holds/eligibility?${params}`)
  if (!res.ok) return parseErrorOrThrow(res, 'Could not check whether you can borrow this book')
  return res.json()
}

// The kiosk passes its session id; the phone sends the borrower's login.
export async function releaseHold(token: string, stationSessionId?: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/holds/${token}/release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...optionalAuth() },
    body: JSON.stringify({ station_session_id: stationSessionId ?? null }),
  })
  if (!res.ok && res.status !== 404) return parseErrorOrThrow(res, 'Could not release the hold')
}

// "Add time": restarts the hold (only near the end; the times are in
// Library Settings).
export async function extendHold(token: string): Promise<{ expires_at: string; seconds_left: number; can_extend: boolean }> {
  const res = await apiFetch(`${API_URL}/holds/${token}/extend`, { method: 'POST', headers: optionalAuth() })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not extend this hold')
  return res.json()
}

// "I can't find it": releases the hold and marks the copy missing.
export async function reportMissing(token: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/holds/${token}/report-missing`, { method: 'POST', headers: optionalAuth() })
  if (!res.ok && res.status !== 404) return parseErrorOrThrow(res, 'Could not report this copy as missing')
}

// Where a borrow is up to: waiting for the phone, waiting for the kiosk
// tap, borrowed, or gone (expired, cancelled or released).
export type HoldStatus = {
  status: 'waiting' | 'awaiting_tap' | 'borrowed' | 'gone'
  seconds_left: number | null
  due_date: string | null
}

// The kiosk asks with its session id; the phone with its login.
export async function fetchHoldStatus(token: string, stationSessionId?: string): Promise<HoldStatus> {
  const qs = stationSessionId ? `?${new URLSearchParams({ station_session_id: stationSessionId })}` : ''
  const res = await apiFetch(`${API_URL}/holds/${token}/status${qs}`, { headers: optionalAuth() })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not check this borrow')
  return res.json()
}

// The phone sends the number on the book's label. A kiosk borrow then waits
// for the second ID tap (status 'awaiting_tap'); a web borrow is done.
export async function verifyHold(params: {
  token: string
  accessionNumber: string
  condition: Condition
  purpose?: string
  notes?: string
}): Promise<HoldStatus> {
  const res = await apiFetch(`${API_URL}/holds/${params.token}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...optionalAuth() },
    body: JSON.stringify({
      accession_number: params.accessionNumber,
      condition: params.condition,
      purpose: params.purpose || undefined,
      notes: params.notes || undefined,
    }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not confirm this loan')
  return res.json()
}

// The second ID tap at the kiosk, which creates the loan.
export async function confirmTap(token: string, stationSessionId: string, rfidUid: string): Promise<HoldStatus> {
  const res = await apiFetch(`${API_URL}/holds/${token}/confirm-tap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ station_session_id: stationSessionId, rfid_uid: rfidUid }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not confirm this loan')
  return res.json()
}

export type HoldDetail = {
  token: string
  expires_at: string
  seconds_left: number
  // False once the hold has used up all the extra time it's allowed
  can_extend: boolean
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
  borrow_limit: number
  loan_period_days: number
  // How long "Add time" adds, and how close to the end it's offered.
  hold_duration_seconds: number
  extend_window_seconds: number
  // A kiosk borrow finishes with a second ID tap at the kiosk.
  needs_kiosk_tap: boolean
  awaiting_tap: boolean
}

// Needs the borrower's login (SignInRequiredError / NotYourBorrowError).
export async function fetchHold(token: string): Promise<HoldDetail> {
  const res = await apiFetch(`${API_URL}/holds/${token}`, { headers: optionalAuth() })
  if (!res.ok) return parseErrorOrThrow(res, 'This hold could not be found')
  return res.json()
}

export type Condition = 'good' | 'minor_wear' | 'already_damaged'
export type ReturnCondition = 'good' | 'fair' | 'damaged' | 'incomplete'
export type FineStatus = 'none' | 'paid' | 'unsettled'

export type Borrower = {
  full_name: string | null
  avatar_url: string | null
}

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
  condition_at_return: ReturnCondition | null
  condition_notes: string | null
  fine_amount: number | null
  // The two parts of fine_amount (null on older loans).
  overdue_fine_amount?: number | null
  damage_fine_amount?: number | null
  fine_status: FineStatus | null
  profiles: Borrower | null
  receipt_number: string | null
  // How the borrower was identified at the desk (null on older loans).
  returned_verified_by?: 'id_tap' | 'id_tap_other' | 'manual' | null
  fine_paid_verified_by?: 'id_tap' | 'manual' | null
  // The librarian, for desk checkouts.
  assisted_by: string | null
  books: Book | null
  // Only set by GET /loans for status === 'overdue' rows.
  days_overdue: number | null
  // "Overdue by 3 school days", or library hours for reserve materials.
  overdue_label?: string | null
  preview_fine_amount: number | null
}

// Loans: students get their own, librarians get all. studentId limits it to
// one patron; dateFilters are for the "Today" lists (the caller works out
// the day's start and end).
export async function fetchLoans(
  studentId?: string,
  dateFilters?: { borrowedFrom?: string; borrowedTo?: string; returnedFrom?: string; returnedTo?: string }
): Promise<Loan[]> {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  const params = new URLSearchParams()
  if (studentId) params.set('student_id', studentId)
  if (dateFilters?.borrowedFrom) params.set('borrowed_from', dateFilters.borrowedFrom)
  if (dateFilters?.borrowedTo) params.set('borrowed_to', dateFilters.borrowedTo)
  if (dateFilters?.returnedFrom) params.set('returned_from', dateFilters.returnedFrom)
  if (dateFilters?.returnedTo) params.set('returned_to', dateFilters.returnedTo)
  const qs = params.toString()
  const res = await apiFetch(`${API_URL}/loans${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load your loans')
  return res.json()
}

// Records that an unpaid fine was paid at the desk.
// rfidUid: the borrower's ID tapped at the desk (required when Library
// Settings say so).
export async function settleFine(loanId: string, receiptNumber: string, rfidUid?: string): Promise<Loan> {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  const res = await apiFetch(`${API_URL}/loans/${loanId}/settle-fine`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ receipt_number: receiptNumber, rfid_uid: rfidUid || undefined }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not record this payment')
  return res.json()
}

// Checkout at the desk (librarians): the scanned accession number picks
// the copy, so no hold is needed.
export async function createAssistedLoan(params: {
  stationSessionId: string
  accessionNumber: string
  condition: Condition
  purpose?: string
  notes?: string
}): Promise<Loan> {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  const res = await apiFetch(`${API_URL}/loans/librarian-assisted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      station_session_id: params.stationSessionId,
      accession_number: params.accessionNumber,
      condition: params.condition,
      purpose: params.purpose || undefined,
      notes: params.notes || undefined,
    }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not confirm this loan')
  return res.json()
}
