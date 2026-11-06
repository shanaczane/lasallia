// API calls for the librarian Reports page. Types match the API's models.

import { getToken } from "@/lib/auth"
import type { InventorySession } from "@/lib/inventory"

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
// titles: books in the category; copies: their book_copies rows. value equals
// copies and sets the bar length.
export type CatalogueSlice = { label: string; titles: number; copies: number; value: number; color: string }
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
export type FineEntry = { title: string; kind: "unsettled" | "accruing" | "paid"; amount: number; detail: string; loan_id: string }
export type FineRow = {
  patron_id: string
  patron: string
  patron_email: string
  program: string
  year: string
  unsettled: number
  accruing: number
  paid: number
  outstanding: number
  entries: FineEntry[]
}
export type ProgramUsage = { program: string; users: number; loans: number }
export type LibraryStats = {
  total_titles: number
  total_copies: number
  active_borrowers: number
  overdue_count: number
  utilization_rate: number
  most_active_category: string | null
  by_program: ProgramUsage[]
}
export type TransactionTrendPoint = { label: string; borrows: number; returns: number }
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

// AI summary per report. null means no summary is available.
export type ReportSummaries = {
  catalogue: string | null
  circulation: string | null
  top_patrons: string | null
  borrowing_trends: string | null
  library_stats: string | null
  transactions: string | null
  overdue: string | null
}

export type ReportFilters = {
  dateFrom?: string
  dateTo?: string
  category?: string
  program?: string
  college?: string
  yearLevel?: number
}

// Report dates ("YYYY-MM-DD") are whole Manila days; the helpers are in
// lib/manilaDates.ts and re-exported here for the pages that already use them.
export {
  formatManilaDate, inManilaDateRange, manilaDayRangeMs, manilaToday, resolveDateRange, type DateRangePreset,
} from "@/lib/manilaDates"

function filterParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.dateFrom) params.set("date_from", filters.dateFrom)
  if (filters.dateTo) params.set("date_to", filters.dateTo)
  if (filters.category) params.set("category", filters.category)
  if (filters.program) params.set("program", filters.program)
  if (filters.college) params.set("college", filters.college)
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

export async function fetchTransactionTrend(filters: ReportFilters, weeks = 8): Promise<TransactionTrendPoint[]> {
  const params = filterParams(filters)
  params.set("weeks", String(weeks))
  return getReport("transaction-trend", params)
}

export async function fetchOverdueReport(filters: ReportFilters): Promise<OverdueRow[]> {
  return getReport("overdue", filterParams(filters))
}

export async function fetchFinesReport(filters: ReportFilters): Promise<FineRow[]> {
  return getReport("fines", filterParams(filters))
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

// Only called when the librarian clicks "Generate Insights".
export async function fetchReportSummaries(filters: ReportFilters): Promise<ReportSummaries> {
  return getReport("summaries", filterParams(filters))
}

// Builds a CSV file in the browser.
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

// ─── Inventory tab ────────────────────────────────────────────────────────────
// Only the date range filter applies.

export type InventoryReportItem = {
  session_id: string
  location: string
  started_at: string
  accession_number: string | null
  title: string | null
  call_number: string | null
  result: "pending" | "found" | "misplaced" | "not_found"
  expected_location: string | null
  resolution: "marked_missing" | "marked_found" | null
}

export async function fetchInventoryReport(filters: ReportFilters): Promise<InventorySession[]> {
  return getReport("inventory", filterParams(filters))
}

export async function fetchInventoryReportItems(filters: ReportFilters): Promise<InventoryReportItem[]> {
  return getReport("inventory/items", filterParams(filters))
}

// ─── Report export (PDF, Excel, CSV built by the API) ─────────────────────
// Only Overdue Loans so far; the other tabs keep downloadCsv and Print.

export type ExportableReport = "overdue"
export type ReportExportFormat = "pdf" | "xlsx" | "csv"

// Filters for an export. Dates are Manila days ("YYYY-MM-DD"), both included.
export type ReportExportRequest = {
  report: ExportableReport
  date_from?: string
  date_to?: string
  category?: string
  program?: string
  college?: string
  year_level?: number
}

export type ReportSignatureTitle = {
  key: "prepared_by" | "noted_by" | "approved_by"
  label: string
  title: string
  placeholder: boolean // not yet confirmed by the library
}

export type ReportExportPreview = {
  title: string
  period: string
  filters: string[]
  key_figures: { label: string; value: string }[]
  computed_summary: string
  row_count: number
  signature_titles: ReportSignatureTitle[]
}

export type ReportExportOptions = {
  format: ReportExportFormat
  summary_text?: string
  summary_source: "ai" | "computed"
  prepared_by_name?: string
  noted_by_name?: string
  approved_by_name?: string
}

export function exportRequest(report: ExportableReport, filters: ReportFilters): ReportExportRequest {
  return {
    report,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    category: filters.category,
    program: filters.program,
    college: filters.college,
    year_level: filters.yearLevel,
  }
}

async function postReport(path: string, body: object, fallback: string): Promise<Response> {
  const res = await fetch(`${API_URL}/reports/${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return parseErrorOrThrow(res, fallback)
  return res
}

export async function fetchExportPreview(req: ReportExportRequest): Promise<ReportExportPreview> {
  return (await postReport("export/preview", req, "Could not prepare the export")).json()
}

// An AI draft of the summary for the librarian to review; null when AI
// isn't available. Only the report's totals are sent to the AI.
export async function fetchExportAiSummary(req: ReportExportRequest): Promise<string | null> {
  const body = await (await postReport("export/ai-summary", req, "Could not draft a summary")).json()
  return body.summary ?? null
}

const EXPORT_SLUGS: Record<ExportableReport, string> = { overdue: "overdue-loans" }

// Same name the API gives the file (core/report_export/definitions.py).
export function exportFileName(req: ReportExportRequest, format: ReportExportFormat): string {
  const slug = EXPORT_SLUGS[req.report]
  const range =
    req.date_from && req.date_to ? `${req.date_from}_to_${req.date_to}`
    : req.date_from ? `from_${req.date_from}`
    : req.date_to ? `to_${req.date_to}`
    : "all_dates"
  return `${slug}_${range}.${format}`
}

export async function downloadReportExport(req: ReportExportRequest, options: ReportExportOptions): Promise<void> {
  const res = await postReport("export", { ...req, ...options }, "Could not export the report")
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = exportFileName(req, options.format)
  a.click()
  URL.revokeObjectURL(url)
}
