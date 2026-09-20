// apps/web/lib/users.ts
// Fetch layer for /users — the librarian Patrons screen (build plan 5.5).

import { getToken } from "@/lib/auth"
import type { UserProfile, UserRole } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function fetchPatrons(): Promise<UserProfile[]> {
  const res = await fetch(`${API_URL}/users`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load patrons")
  return res.json()
}

// Librarian-assisted borrow's fallback student picker, when there's no ID
// card to tap — searches by name or email, scoped to students only.
export async function searchPatrons(q: string, role?: UserRole): Promise<UserProfile[]> {
  const params = new URLSearchParams()
  if (q.trim()) params.set("q", q.trim())
  if (role) params.set("role", role)
  const res = await fetch(`${API_URL}/users?${params.toString()}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to search patrons")
  return res.json()
}

export type PatronUpdate = {
  status?: "active" | "inactive"
  program?: string | null
  year_level?: number | null
  college?: string | null
}

export async function updatePatron(userId: string, changes: PatronUpdate): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(changes),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not update this patron")
  return res.json()
}

// Thin wrapper kept for the existing deactivate/activate call site — same
// endpoint, just the one field.
export async function updatePatronStatus(userId: string, status: "active" | "inactive"): Promise<UserProfile> {
  return updatePatron(userId, { status })
}
