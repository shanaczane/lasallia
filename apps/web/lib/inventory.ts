// apps/web/lib/inventory.ts
// Fetch layer for /inventory/* — the Inventory module
// (docs/lasallia-inventory-build-plan.md). Librarian-only.

import { getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders(json = false): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return json
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}` }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export type InventoryLocation = {
  floor: string
  aisle: string | null // null = the whole floor
  label: string
  expected_copies: number
  open_session_id: string | null
}

export type InventorySessionStatus = "in_progress" | "completed" | "cancelled"
export type InventoryItemResult = "pending" | "found" | "misplaced" | "not_found"
export type InventoryResolution = "marked_missing" | "marked_found"
export type ScanOutcome = "found" | "misplaced" | "already_scanned" | "on_loan" | "reserved" | "damaged" | "unknown"

export type InventorySession = {
  id: string
  floor: string
  aisle: string | null
  label: string
  status: InventorySessionStatus
  started_by_name: string | null
  started_at: string
  completed_at: string | null
  expected: number
  found: number
  misplaced: number
  not_found: number
  pending: number
  resolved: number
}

export type InventoryItem = {
  id: string
  session_id: string
  book_copy_id: string
  book_id: string | null
  accession_number: string | null
  title: string | null
  author: string | null
  call_number: string | null
  copy_status: string | null
  expected: boolean
  result: InventoryItemResult
  expected_location: string | null
  scanned_at: string | null
  resolution: InventoryResolution | null
  resolved_at: string | null
}

export type InventorySessionDetail = InventorySession & { items: InventoryItem[] }

export type ScanResult = {
  outcome: ScanOutcome
  message: string
  item: InventoryItem | null
  session: InventorySession
}

export type InventoryCounts = { missing: number; misplaced: number }

export async function fetchInventoryLocations(): Promise<InventoryLocation[]> {
  const res = await fetch(`${API_URL}/inventory/locations`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load shelf locations")
  return res.json()
}

export async function fetchInventorySessions(): Promise<InventorySession[]> {
  const res = await fetch(`${API_URL}/inventory/sessions`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load inventory checks")
  return res.json()
}

export async function fetchInventorySession(id: string): Promise<InventorySessionDetail> {
  const res = await fetch(`${API_URL}/inventory/sessions/${id}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load this inventory check")
  return res.json()
}

export async function startInventorySession(floor: string, aisle: string | null): Promise<InventorySession> {
  const res = await fetch(`${API_URL}/inventory/sessions`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ floor, aisle }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not start the inventory check")
  return res.json()
}

export async function scanInventoryCode(sessionId: string, code: string): Promise<ScanResult> {
  const res = await fetch(`${API_URL}/inventory/sessions/${sessionId}/scan`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ code }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Scan failed")
  return res.json()
}

export async function completeInventorySession(sessionId: string): Promise<InventorySession> {
  const res = await fetch(`${API_URL}/inventory/sessions/${sessionId}/complete`, { method: "POST", headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Could not finish the inventory check")
  return res.json()
}

export async function cancelInventorySession(sessionId: string): Promise<InventorySession> {
  const res = await fetch(`${API_URL}/inventory/sessions/${sessionId}/cancel`, { method: "POST", headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Could not cancel the inventory check")
  return res.json()
}

export async function resolveInventoryItem(itemId: string, action: "missing" | "found"): Promise<InventoryItem> {
  const res = await fetch(`${API_URL}/inventory/items/${itemId}/resolve`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ action }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not update this copy")
  return res.json()
}

export async function fetchInventoryCounts(): Promise<InventoryCounts> {
  const res = await fetch(`${API_URL}/inventory/counts`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load missing/misplaced counts")
  return res.json()
}

export type FlaggedCopy = {
  copy_id: string
  book_id: string
  accession_number: string
  title: string
  call_number: string | null
  status: "missing" | "misplaced"
  location: string
}

export async function fetchFlaggedCopies(): Promise<FlaggedCopy[]> {
  const res = await fetch(`${API_URL}/inventory/flagged`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load missing/misplaced copies")
  return res.json()
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}
