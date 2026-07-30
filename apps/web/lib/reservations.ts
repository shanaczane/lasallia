// apps/web/lib/reservations.ts
// Fetch layer for /reservations — every call is authenticated (RLS scopes
// results server-side: students see their own, librarians see all).

import { Reservation, ReservationStatus } from '@lasallia/types'
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

export async function updateReservationStatus(id: string, status: ReservationStatus): Promise<Reservation> {
  const res = await fetch(`${API_URL}/reservations/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to update reservation')
  return res.json()
}
