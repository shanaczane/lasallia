// API calls for book requests. Faculty submit and track their own;
// librarians list and update them.

import { getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type BookRequestStatus = "pending" | "approved" | "rejected" | "fulfilled" | "cancelled"
export type BookRequestFormat = "print" | "ebook" | "either"

export type BookRequestAttachment = {
  id: string
  url: string
  name: string
  created_at: string
}

export type BookRequest = {
  id: string
  requester_id: string
  title: string
  author: string | null
  isbn: string | null
  note: string | null
  format: BookRequestFormat
  copies: number
  course: string | null
  status: BookRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  profiles: { full_name: string | null; email: string; college: string | null } | null
  attachments: BookRequestAttachment[]
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

// No Content-Type: the browser sets it for file uploads.
function authOnlyHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function createBookRequest(fields: {
  title: string
  author?: string
  isbn?: string
  note?: string
  format?: BookRequestFormat
  copies?: number
  course?: string
}): Promise<BookRequest> {
  const res = await fetch(`${API_URL}/book-requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not submit your request")
  return res.json()
}

export async function uploadRequestAttachments(requestId: string, files: File[]): Promise<BookRequest> {
  const form = new FormData()
  for (const file of files) form.append("files", file)
  const res = await fetch(`${API_URL}/book-requests/${requestId}/attachments`, {
    method: "POST",
    headers: authOnlyHeaders(),
    body: form,
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not attach these files")
  return res.json()
}

export async function deleteRequestAttachment(requestId: string, attachmentId: string): Promise<BookRequest> {
  const res = await fetch(`${API_URL}/book-requests/${requestId}/attachments/${attachmentId}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not remove this attachment")
  return res.json()
}

// Faculty edit their own pending request; send only what changed. Fails
// (409) once a librarian has acted on it.
export async function updateMyBookRequest(
  id: string,
  fields: Partial<{
    title: string
    author: string
    isbn: string
    note: string
    format: BookRequestFormat
    copies: number
    course: string
  }>
): Promise<BookRequest> {
  const res = await fetch(`${API_URL}/book-requests/${id}/edit`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not update this request")
  return res.json()
}

export async function cancelBookRequest(id: string): Promise<BookRequest> {
  const res = await fetch(`${API_URL}/book-requests/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not cancel this request")
  return res.json()
}

export async function fetchMyBookRequests(): Promise<BookRequest[]> {
  const res = await fetch(`${API_URL}/book-requests/me`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load your requests")
  return res.json()
}

export async function fetchBookRequests(status?: BookRequestStatus): Promise<BookRequest[]> {
  const qs = status ? `?request_status=${encodeURIComponent(status)}` : ""
  const res = await fetch(`${API_URL}/book-requests${qs}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load requests")
  return res.json()
}

export async function updateBookRequest(id: string, status: BookRequestStatus): Promise<BookRequest> {
  const res = await fetch(`${API_URL}/book-requests/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not update this request")
  return res.json()
}
