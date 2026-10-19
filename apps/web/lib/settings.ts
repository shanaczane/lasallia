// API calls for library settings (librarians only, except the public ones).

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

  // "HH:MM" or "HH:MM:SS". Both null means closed (no fines those days).
  weekday_open_time: string | null
  weekday_close_time: string | null
  saturday_open_time: string | null
  saturday_close_time: string | null
  sunday_open_time: string | null
  sunday_close_time: string | null

  // null only when the defaults are being used.
  updated_at: string | null
  updated_by: string | null
  // True when the settings table is missing, so saving won't work.
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

export type PublicLibrarySettings = Pick<
  LibrarySettings,
  | "library_name" | "address" | "contact_email" | "contact_number"
  | "weekday_open_time" | "weekday_close_time"
  | "saturday_open_time" | "saturday_close_time"
  | "sunday_open_time" | "sunday_close_time"
>

// No login needed (used by the login page).
export async function fetchPublicLibrarySettings(): Promise<PublicLibrarySettings> {
  const res = await fetch(`${API_URL}/settings/public`)
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load library info")
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
