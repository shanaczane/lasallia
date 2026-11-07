// API calls for the Audit Log page (librarians only). Exports go through
// the reports export in lib/reports.ts.

import { getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export const AUDIT_PAGE_SIZE = 25

export type AuditEntry = {
  id: string
  librarian_profile_id: string
  librarian_name: string
  action: string
  action_label: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export type AuditPage = { items: AuditEntry[]; total: number; page: number; page_size: number }

export type AuditOptions = {
  librarians: { id: string; full_name: string }[]
  actions: { value: string; label: string }[]
}

// Dates are Manila days ("YYYY-MM-DD"), both included.
export type AuditFilters = {
  date_from?: string
  date_to?: string
  librarian_profile_id?: string
  action?: string
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

async function getJson<T>(path: string, fallback: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === "string" ? body.detail : fallback)
  }
  return res.json()
}

export function fetchAuditLog(filters: AuditFilters, page: number): Promise<AuditPage> {
  const params = new URLSearchParams({ page: String(page), page_size: String(AUDIT_PAGE_SIZE) })
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  return getJson(`/audit-log?${params}`, "Could not load the audit log")
}

export function fetchAuditOptions(): Promise<AuditOptions> {
  return getJson("/audit-log/options", "Could not load the audit log filters")
}

// One line for the table, e.g. "title: Old → New; reason: Typo".
export function detailText(details: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (key === "changed" && value && typeof value === "object") {
      for (const [field, change] of Object.entries(value as Record<string, { from: unknown; to: unknown }>)) {
        parts.push(`${field}: ${String(change.from ?? "—")} → ${String(change.to ?? "—")}`)
      }
    } else if (value !== null && value !== undefined) {
      parts.push(`${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    }
  }
  return parts.join("; ")
}
