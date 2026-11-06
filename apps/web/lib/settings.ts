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

  // Kiosk and borrowing timers, in seconds.
  kiosk_idle_timeout_seconds: number
  kiosk_idle_warning_seconds: number
  hold_duration_seconds: number
  hold_extend_window_seconds: number
  hold_max_seconds: number
  kiosk_tap_confirm_seconds: number
  // Fine payments and desk pickups need the borrower's own ID tap.
  require_id_tap_at_desk: boolean

  // Job titles under the signature lines on exported reports (migration 0060).
  report_prepared_by_title: string
  report_noted_by_title: string
  report_approved_by_title: string

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

// The signature job titles used until the library confirms them. Must match
// apps/api/core/report_export/layout.py (PLACEHOLDER_TITLES).
export const REPORT_TITLE_FIELDS: { key: "report_prepared_by_title" | "report_noted_by_title" | "report_approved_by_title"; label: string; placeholder: string }[] = [
  { key: "report_prepared_by_title", label: "Prepared by", placeholder: "Librarian" },
  { key: "report_noted_by_title", label: "Noted by", placeholder: "Head Librarian" },
  { key: "report_approved_by_title", label: "Approved by", placeholder: "Director, Learning Resource Center" },
]

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
  // The kiosk reads its idle timer before anyone taps in.
  | "kiosk_idle_timeout_seconds" | "kiosk_idle_warning_seconds"
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
