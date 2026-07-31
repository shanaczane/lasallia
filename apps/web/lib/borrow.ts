// apps/web/lib/borrow.ts
// Fetch layer for /borrow — every call is authenticated (RLS scopes
// results server-side: patrons see their own loans, librarians see all).

import { BorrowStatus, BorrowTransaction } from '@lasallia/types'
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

export async function fetchBorrowTransactions(filters?: {
  status?: BorrowStatus
  bookId?: string
}): Promise<BorrowTransaction[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.bookId) params.set('book_id', filters.bookId)
  const qs = params.toString()

  const res = await fetch(`${API_URL}/borrow${qs ? `?${qs}` : ''}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load borrow transactions')
  return res.json()
}

export async function createBorrow(bookId: string, patronEmail: string): Promise<BorrowTransaction> {
  const res = await fetch(`${API_URL}/borrow`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ book_id: bookId, patron_email: patronEmail }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to borrow this book')
  return res.json()
}

export async function returnBorrow(transactionId: string): Promise<BorrowTransaction> {
  const res = await fetch(`${API_URL}/borrow/${transactionId}/return`, {
    method: 'PATCH',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to return this book')
  return res.json()
}
