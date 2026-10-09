// apps/web/lib/sync.ts
// Fetch layer for /sync/* — catalog import from a Destiny MARC export or the
// LRC's own Excel sheet. Librarian-only.

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

export type SyncIssue = {
  record: number
  title: string | null
  message: string
  location: string | null // "Sheet BSIT, row 12" for spreadsheet imports
}

export type SyncFieldChange = {
  field: string
  old: string | number | null
  new: string | number | null
}

export type SyncItem = {
  action: "add" | "update"
  record: number
  title: string
  author: string | null
  book_id: string | null
  matched_by: "accession" | "isbn" | "title_author" | null
  archived: boolean
  changes: SyncFieldChange[]
  new_copies: string[]
  copies_not_in_export: string[]
  location: string | null
}

export type SyncSource = "destiny_marc" | "lrc_spreadsheet"

export type SyncPreview = {
  dry_run: boolean
  source: SyncSource
  file_name: string | null
  records_read: number
  books_added: number
  books_updated: number
  books_unchanged: number
  copies_added: number
  items: SyncItem[]
  errors: SyncIssue[]
  warnings: SyncIssue[]
  run_id: string | null
}

export type SyncRun = {
  id: string
  source: SyncSource
  file_name: string | null
  started_by: string | null
  started_by_name: string | null
  records_read: number
  books_added: number
  books_updated: number
  books_unchanged: number
  copies_added: number
  errors: SyncIssue[]
  created_at: string
}

export function isSpreadsheet(file: File): boolean {
  return file.name.toLowerCase().endsWith(".xlsx")
}

// dryRun=true only previews; dryRun=false applies. The same file is sent
// both times — the API keeps nothing between the two calls. `college` is
// only used for .xlsx uploads (the sheets don't say which college they're for).
export async function importCatalog(file: File, dryRun: boolean, college?: string): Promise<SyncPreview> {
  const form = new FormData()
  form.append("file", file)
  const qs = new URLSearchParams({ dry_run: String(dryRun) })
  if (college) qs.set("college", college)
  const res = await fetch(`${API_URL}/sync/catalog?${qs}`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) return parseErrorOrThrow(res, dryRun ? "Could not read this export file" : "The import failed")
  return res.json()
}

export async function fetchSyncRuns(limit = 20): Promise<SyncRun[]> {
  const res = await fetch(`${API_URL}/sync/runs?limit=${limit}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load import history")
  return res.json()
}

export async function downloadTemplate(): Promise<void> {
  const res = await fetch(`${API_URL}/sync/template`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Could not download the template")
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = "lasallia-catalog-template.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}
