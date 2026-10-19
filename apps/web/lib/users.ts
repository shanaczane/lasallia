// API calls for the librarian Patrons screen.

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

// Finds patrons by name, email or ID number (e.g. at the desk without an ID card).
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
  id_number?: string | null
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

// Shortcut for activating or deactivating an account.
export async function updatePatronStatus(userId: string, status: "active" | "inactive"): Promise<UserProfile> {
  return updatePatron(userId, { status })
}
