// apps/web/lib/settings.ts
// Fetch layer for /settings — the librarian Settings page's Library Info
// and Borrowing Rules tabs (one shared, persisted row; see
// apps/api/migrations/0024_library_settings.sql). Librarian-only.

import { getToken } from "@/lib/auth"

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

export type LibrarySettings = {
  library_name: string
  address: string
  contact_email: string
  contact_number: string

  max_books_per_borrower: number
  standard_loan_period_days: number
  max_renewals: number
  renewal_period_days: number
  fine_per_day: number
  max_fine_per_book: number
  reservation_hold_period_days: number
  max_active_reservations: number

  // "HH:MM" (or "HH:MM:SS"). All three groups are nullable — null on
  // both means closed that group entirely (weekday included, e.g. a
  // semester break), and fines don't accrue for it (core/calendar.py
  // reads these same fields).
  weekday_open_time: string | null
  weekday_close_time: string | null
  saturday_open_time: string | null
  saturday_close_time: string | null
  sunday_open_time: string | null
  sunday_close_time: string | null

  // null only in the pre-migration fallback (is_default: true) — a row
  // that's actually been saved always has this set.
  updated_at: string | null
  updated_by: string | null
  // True only when migrations/0024 hasn't been applied to this database
  // yet — the API still answers with the same defaults every borrow/
  // reservation endpoint falls back to, but Save has nothing to upsert
  // into until the migration runs.
  is_default: boolean
}

export type UpdateLibrarySettings = Partial<
  Omit<LibrarySettings, "updated_at" | "updated_by" | "is_default">
>

export async function fetchLibrarySettings(): Promise<LibrarySettings> {
  const res = await fetch(`${API_URL}/settings`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load settings")
  return res.json()
}

export async function updateLibrarySettings(changes: UpdateLibrarySettings): Promise<LibrarySettings> {
  const res = await fetch(`${API_URL}/settings`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(changes),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not save settings")
  return res.json()
}
