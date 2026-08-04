// apps/web/lib/reservations.ts
// Fetch layer for /reservations — every call is authenticated (RLS scopes
// results server-side: students see their own, librarians see all).

import { Reservation } from '@lasallia/types'
import { getToken } from '@/lib/auth'
import type { Condition, Loan } from '@/lib/kiosk'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function fetchReservations(): Promise<Reservation[]> {
  const res = await fetch(`${API_URL}/reservations`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load reservations')
  return res.json()
}

export async function createReservation(bookId: string): Promise<Reservation> {
  const res = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ book_id: bookId }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to create reservation')
  return res.json()
}

// 'cancelled' is the only status this endpoint accepts now — becoming
// 'ready' is automatic (Phase 4's return handler, or the pickup-window
// expiry sweep), never a manual PATCH.
export async function cancelReservation(id: string): Promise<Reservation> {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'cancelled' }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to cancel reservation')
  return res.json()
}

// Fulfillment (plan 5.3) — same possession check as a normal borrow,
// sourced from a 'ready' reservation's assigned copy.
export async function pickupReservation(
  id: string,
  params: { condition: Condition; accessionNumber: string; purpose?: string; notes?: string }
): Promise<Loan> {
  const res = await fetch(`${API_URL}/reservations/${id}/pickup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      accession_number: params.accessionNumber,
      condition: params.condition,
      purpose: params.purpose || undefined,
      notes: params.notes || undefined,
    }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not confirm this pickup')
  return res.json()
}
