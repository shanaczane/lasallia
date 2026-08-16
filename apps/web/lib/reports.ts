// apps/web/lib/reports.ts
// Fetch layer for /reports/* — the librarian Reports page (reports plan
// Phase 1). Field names on the first four types match the backend
// Pydantic models field-for-field, which in turn mirror what this
// page's old client-side derive* functions used to produce locally —
// this file is a data-source swap for that page, not a rewrite of it.

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

export type Bucket = { label: string; value: number }
export type CatalogueSlice = { label: string; value: number; color: string }
export type TopPatron = { id: string; name: string; program: string; count: number }
export type OverdueRow = {
  id: string
  patron: string
  patronEmail: string
  program: string
  year: string
  book: string
  author: string
  dueDate: string
  daysOverdue: number
  fine: number
}
export type LibraryStats = {
  total_titles: number
  total_copies: number
  active_borrowers: number
  overdue_count: number
  utilization_rate: number
  most_active_category: string | null
}
export type TransactionStats = {
  total_transactions: number
  loan_count: number
  reservation_count: number
  average_loan_duration_days: number | null
}
export type ShelfListRow = {
  accession_number: string
  book_id: string
  title: string
  author: string
  call_number: string
  category: string
  shelf_location: string | null
  floor: string | null
  aisle: string | null
  status: string
}

// Reports plan Phase 3 — one optional field per AI-summarized report.
// null means no summary is available (no OPENAI_API_KEY configured, or
// the call failed) — never a placeholder string.
export type ReportSummaries = {
  catalogue: string | null
  circulation: string | null
  top_patrons: string | null
  borrowing_trends: string | null
  library_stats: string | null
  transactions: string | null
  overdue: string | null
}

export type DateRangePreset = "week" | "month" | "semester" | "custom"

export type ReportFilters = {
  dateFrom?: string
  dateTo?: string
  category?: string
  program?: string
  yearLevel?: number
}

// Resolves the filter bar's quick-select into actual ISO from/to bounds.
// "custom" passes the picked dates through as-is (empty string -> no
// bound, same as not filtering that side at all).
export function resolveDateRange(preset: DateRangePreset, customFrom: string, customTo: string): { dateFrom?: string; dateTo?: string } {
  if (preset === "custom") {
    return {
      dateFrom: customFrom ? new Date(customFrom).toISOString() : undefined,
      dateTo: customTo ? new Date(customTo).toISOString() : undefined,
    }
  }
  const now = new Date()
  const from = new Date(now)
  if (preset === "week") from.setDate(now.getDate() - 7)
  else if (preset === "month") from.setMonth(now.getMonth() - 1)
  else from.setMonth(now.getMonth() - 6) // semester ≈ 6 months
  return { dateFrom: from.toISOString(), dateTo: now.toISOString() }
}

function filterParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.set("date_from", filters.dateFrom)
  if (filters.dateTo) params.set("date_to", filters.dateTo)
  if (filters.category) params.set("category", filters.category)
  if (filters.program) params.set("program", filters.program)
  if (filters.yearLevel != null) params.set("year_level", String(filters.yearLevel))
  return params
}

async function getReport<T>(path: string, params: URLSearchParams): Promise<T> {
  const qs = params.toString()
  const res = await fetch(`${API_URL}/reports/${path}${qs ? `?${qs}` : ""}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, `Failed to load the ${path} report`)
  return res.json()
}

export async function fetchCatalogueReport(filters: ReportFilters): Promise<CatalogueSlice[]> {
  return getReport("catalogue", filterParams(filters))
}

export async function fetchCirculationSummary(filters: ReportFilters, months = 6): Promise<Bucket[]> {
  const params = filterParams(filters)
  params.set("months", String(months))
  return getReport("circulation-summary", params)
}

export async function fetchBorrowingTrends(filters: ReportFilters, weeks = 8): Promise<Bucket[]> {
  const params = filterParams(filters)
  params.set("weeks", String(weeks))
  return getReport("borrowing-trends", params)
}

export async function fetchTopPatrons(filters: ReportFilters, limit = 5): Promise<TopPatron[]> {
  const params = filterParams(filters)
  params.set("limit", String(limit))
  return getReport("top-patrons", params)
}

export async function fetchOverdueReport(filters: ReportFilters): Promise<OverdueRow[]> {
  return getReport("overdue", filterParams(filters))
}

export async function fetchLibraryStats(filters: ReportFilters): Promise<LibraryStats> {
  return getReport("library-stats", filterParams(filters))
}

export async function fetchTransactionStats(filters: ReportFilters): Promise<TransactionStats> {
  return getReport("transactions", filterParams(filters))
}

export async function fetchShelfList(filters: ReportFilters, floor?: string, aisle?: string): Promise<ShelfListRow[]> {
  const params = filterParams(filters)
  if (floor) params.set("floor", floor)
  if (aisle) params.set("aisle", aisle)
  return getReport("shelf-list", params)
}

// Reports plan Phase 3 — deliberately not auto-fetched on every filter
// change (see "Generate Insights" in reports/page.tsx); only called
// when the librarian explicitly asks for it.
export async function fetchReportSummaries(filters: ReportFilters): Promise<ReportSummaries> {
  return getReport("summaries", filterParams(filters))
}

// Client-side CSV export (plan: "no new backend/library needed") —
// the Shelf List and Overdue table both exist to be printed or handed
// off, not just viewed on screen.
export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n")
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
