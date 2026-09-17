// apps/web/lib/books.ts
// Thin fetch layer over apps/api's /books endpoints — mirrors lib/auth.ts's pattern.

import { Book, BookSearchResponse } from '@lasallia/types'
import { getToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// Opportunistic, not required: guests/students get the public (accession
// number redacted) response either way, but a signed-in librarian needs
// their token attached to unlock it — same shared catalog fetch, used by
// the librarian scanner too.
function optionalAuthHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchBooks(): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books`, { headers: optionalAuthHeaders() })
  if (!res.ok) throw new Error('Failed to load the catalog')
  const data: BookSearchResponse = await res.json()
  return data.books
}

export async function fetchBook(id: string): Promise<Book | null> {
  const res = await fetch(`${API_URL}/books/${id}`, { headers: optionalAuthHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load this book')
  return res.json()
}

// ── Librarian-only: real per-copy data (book_copies), not the mock rows
// CopyManagementTable still generates from total_copies/available_copies.

export type BookCopy = {
  id: string
  accession_number: string
  status: string
  shelf_location: string | null
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function fetchBookCopies(bookId: string): Promise<BookCopy[]> {
  const res = await fetch(`${API_URL}/books/${bookId}/copies`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load copies for this book')
  return res.json()
}

// Sends a missing/lost/damaged copy to for_reshelving — the status machine
// (migration 0004) never allows a straight jump back to available. The
// librarian finishes the transition via the existing Reshelving Queue scan.
export async function markCopyFound(copyId: string): Promise<void> {
  const res = await fetch(`${API_URL}/books/copies/${copyId}/mark-found`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not mark this copy as found')
}
