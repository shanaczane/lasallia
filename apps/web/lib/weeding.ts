// apps/web/lib/weeding.ts
// Fetch layer for /weeding/* — Reports plan Phase 2. Librarian-only.

import { getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export type WeedingCandidate = {
  book_id: string
  title: string
  author: string
  category: string
  published_year: number | null
  borrow_count_in_window: number
  years_since_added: number
  heuristic_reason: string
  reason: string
}

export type WeedingEvent = {
  id: string
  book_id: string
  book_title: string | null
  event_type: "archived" | "restored" | "dismissed"
  reason: string | null
  performed_by: string | null
  performed_by_name: string | null
  occurred_at: string
}

export async function fetchWeedingCandidates(): Promise<WeedingCandidate[]> {
  const res = await fetch(`${API_URL}/weeding/candidates`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load weeding candidates")
  return res.json()
}

export async function fetchWeedingEvents(limit = 50): Promise<WeedingEvent[]> {
  const res = await fetch(`${API_URL}/weeding/events?limit=${limit}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load the weeding log")
  return res.json()
}

export async function archiveBook(bookId: string, reason?: string): Promise<void> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : ""
  const res = await fetch(`${API_URL}/weeding/${bookId}/archive${qs}`, { method: "POST", headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Could not archive this book")
}

export async function restoreBook(bookId: string): Promise<void> {
  const res = await fetch(`${API_URL}/weeding/${bookId}/restore`, { method: "POST", headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Could not restore this book")
}

export async function dismissWeedingCandidate(bookId: string, reason?: string): Promise<void> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : ""
  const res = await fetch(`${API_URL}/weeding/${bookId}/dismiss${qs}`, { method: "POST", headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Could not dismiss this candidate")
}
