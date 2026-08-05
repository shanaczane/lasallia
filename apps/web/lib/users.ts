// apps/web/lib/users.ts
// Fetch layer for /users — the librarian Patrons screen (build plan 5.5).

import { getToken } from "@/lib/auth"
import type { UserProfile } from "@lasallia/types"

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

export async function updatePatronStatus(
  userId: string,
  status: "active" | "inactive"
): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not update this patron's status")
  return res.json()
}
