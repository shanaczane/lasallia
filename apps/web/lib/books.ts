// API calls for the catalog.

import { Book, BookSearchResponse } from '@lasallia/types'
import { getToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// Sends the token if signed in, so librarians also get accession numbers.
function optionalAuthHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Leaves out descriptions unless full is true (they're most of the size).
export async function fetchBooks({ full = false }: { full?: boolean } = {}): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books${full ? '?include_abstract=true' : ''}`, { headers: optionalAuthHeaders() })
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

// "You may also like" books. Returns [] on failure, so the row just hides.
export async function fetchSimilarBooks(id: string, limit = 5): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books/${id}/similar?limit=${limit}`, { headers: optionalAuthHeaders() })
  if (!res.ok) return []
  return res.json()
}

// What the book form sends to the API.
export type BookWritePayload = Omit<
  Book,
  'id' | 'created_at' | 'updated_at' | 'expected_back' | 'waiting_count' | 'cover_color' | 'call_number_start'
>

export async function createBook(data: BookWritePayload): Promise<Book> {
  const res = await fetch(`${API_URL}/books`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not add this book')
  return res.json()
}

export async function updateBook(id: string, data: BookWritePayload): Promise<Book> {
  const res = await fetch(`${API_URL}/books/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not save changes to this book')
  return res.json()
}

// Deletes a book for good. Refused (409) if a copy is on loan; archive it instead.
export async function deleteBook(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/books/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not delete this book')
}

// Raises the copy count of an existing book. Only changes counters, not
// real copies (see schemas/book.py's AddCopiesRequest).
export async function addCopiesToBook(id: string, count: number): Promise<Book> {
  const res = await fetch(`${API_URL}/books/${id}/add-copies`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not add copies to this book')
  return res.json()
}

// ── Librarians only: individual copies.

export type BookCopy = {
  id: string
  accession_number: string
  status: string
  // Always "Unassigned"; use the book's shelf_location instead.
  shelf_location: string | null
  // Only for copies on loan: who has it and when it's due.
  borrower_name: string | null
  due_date: string | null
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

// Uploads a cover (max 5 MB, JPG/PNG/WebP) and returns its URL.
export async function uploadBookCover(bookId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/books/${bookId}/cover`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not upload the cover image')
  const data: { cover_url: string } = await res.json()
  return data.cover_url
}

// Marks a missing/lost/damaged copy found. It goes to the reshelving queue,
// and the reshelving scan makes it available.
export async function markCopyFound(copyId: string): Promise<void> {
  const res = await fetch(`${API_URL}/books/copies/${copyId}/mark-found`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not mark this copy as found')
}
