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
