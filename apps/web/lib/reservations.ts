// API calls for reservations. Students see their own, librarians see all.

import { Reservation } from '@lasallia/types'
import { getToken } from '@/lib/auth'

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

// userId (librarians) limits it to one patron.
export async function fetchReservations(userId?: string): Promise<Reservation[]> {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
  const res = await fetch(`${API_URL}/reservations${qs}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load reservations')
  return res.json()
}

export type ReservationEstimate = {
  queue_position: number
  estimated_ready_at: string | null // null when no copy is expected back at all
  hold_period_days: number
  can_reserve: boolean
  reason: string | null // why not, when can_reserve is false
}

// Queue position and rough ready date, shown before confirming.
export async function fetchReservationEstimate(bookId: string): Promise<ReservationEstimate> {
  const res = await fetch(`${API_URL}/reservations/estimate?book_id=${encodeURIComponent(bookId)}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to estimate your wait')
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

// Only cancelling is possible; 'ready' is set automatically.
export async function cancelReservation(id: string): Promise<Reservation> {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'cancelled' }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to cancel reservation')
  return res.json()
}
