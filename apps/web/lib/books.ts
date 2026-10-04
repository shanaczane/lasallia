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

// The list omits each book's abstract (most of the payload, and only the detail
// page and the librarian edit form use it). full: true asks for it too.
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

// Book detail page's "You may also like" — the TF-IDF/cosine-similarity
// neighbors already computed for this book (book_similarities), not a
// same-category guess. Empty array on failure, same as ForYouSection's own
// "hide the section rather than show an error" rule — this is a nice-to-have
// row, not core page content worth blocking or erroring the page over.
export async function fetchSimilarBooks(id: string, limit = 5): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books/${id}/similar?limit=${limit}`, { headers: optionalAuthHeaders() })
  if (!res.ok) return []
  return res.json()
}

// Mirrors schemas.book.BookWrite on the API — the librarian Add/Edit form's
// full field set, minus the read-only/derived ones (id, timestamps,
// available_copies is optional and defaults to total_copies server-side).
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

// Permanent delete — refused server-side (409) if any copy of this book
// has an active/overdue loan. Archive (lib/weeding.ts) is the alternative
// for a book that can't be deleted yet.
export async function deleteBook(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/books/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not delete this book')
}

// Bumps total_copies/available_copies on an existing title instead of
// cataloging a near-duplicate as a second book — used when BookFormModal's
// Add form detects the title being added already exists.
export async function addCopiesToBook(id: string, count: number): Promise<Book> {
  const res = await fetch(`${API_URL}/books/${id}/add-copies`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not add copies to this book')
  return res.json()
}

// ── Librarian-only: real per-copy data (book_copies) — see
// components/ui/catalog/CopyManagementTable.tsx.

export type BookCopy = {
  id: string
  accession_number: string
  status: string
  // book_copies.shelf_location is never actually populated (every row in
  // the DB is the literal string "Unassigned") — a copy shelves wherever
  // its title does, so the book's own shelf_location is what's accurate,
  // not this column. Kept on the type since the API still returns it, but
  // CopyManagementTable ignores it in favor of a `shelfLocation` prop.
  shelf_location: string | null
  // Set only when status is on_loan/overdue — who has it and when it's
  // due, joined in server-side from the matching loan. Null otherwise.
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

// Uploads a cover image to Supabase Storage (via the API, which enforces the
// 5 MB / JPG-PNG-WebP limits) and returns the new public cover_url. Only
// works for books that exist in the database.
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
