// Audit Log: who did what under the shared librarian login, newest first,
// with filters and an export through the shared report export.
"use client"

import { useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import { Pagination } from "@/components/ui/catalog/Pagination"
import { ReportExportDialog } from "@/components/ui/reports/ReportExportDialog"
import {
  AUDIT_PAGE_SIZE,
  detailText,
  fetchAuditLog,
  fetchAuditOptions,
  type AuditFilters,
  type AuditOptions,
  type AuditPage,
} from "@/lib/auditLog"
import type { ReportExportFormat, ReportExportRequest } from "@/lib/reports"

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" } as const
const small = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" } as const
const fieldClass = "w-full px-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-900 outline-none transition-colors focus:border-green-700 focus:ring-1 focus:ring-green-700"
// Same chevron as the other filter dropdowns, inset from the edge, with
// room on the right so a long name doesn't run under it.
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"
const selectClass = `${fieldClass} appearance-none pr-9 cursor-pointer hover:border-ink-300`
const selectStyle = {
  ...body,
  backgroundImage: `url("${SELECT_CHEVRON}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
} as const

const WHEN = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
})

const EXPORTS: { format: ReportExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "csv", label: "CSV" },
]

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({})
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AuditPage | null>(null)
  const [options, setOptions] = useState<AuditOptions | null>(null)
  const [error, setError] = useState("")
  const [exportFormat, setExportFormat] = useState<ReportExportFormat | null>(null)

  useEffect(() => {
    fetchAuditOptions().then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAuditLog(filters, page)
      .then((next) => {
        if (cancelled) return
        setResult(next)
        setError("")
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the audit log")
      })
    return () => { cancelled = true }
  }, [filters, page])

  function setFilter(key: keyof AuditFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
    setPage(1)
  }

  const exportRequest = useMemo<ReportExportRequest>(() => ({ report: "audit_log", ...filters }), [filters])
  const totalPages = result ? Math.max(Math.ceil(result.total / AUDIT_PAGE_SIZE), 1) : 1

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-ink-900 font-semibold leading-tight" style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}>
            Audit Log
          </h1>
          <p className="text-ink-500 mt-1" style={body}>
            Every recorded librarian action. Entries can&apos;t be changed or deleted.
          </p>
        </div>
        <div className="flex gap-2">
          {EXPORTS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              onClick={() => setExportFormat(format)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors"
              style={body}
            >
              <Download size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-ink-700 font-medium" style={small}>
          From
          <input type="date" value={filters.date_from ?? ""} onChange={(e) => setFilter("date_from", e.target.value)} className={fieldClass} style={body} />
        </label>
        <label className="flex flex-col gap-1 text-ink-700 font-medium" style={small}>
          To
          <input type="date" value={filters.date_to ?? ""} onChange={(e) => setFilter("date_to", e.target.value)} className={fieldClass} style={body} />
        </label>
        <label className="flex flex-col gap-1 text-ink-700 font-medium" style={small}>
          Librarian
          <select value={filters.librarian_profile_id ?? ""} onChange={(e) => setFilter("librarian_profile_id", e.target.value)} className={selectClass} style={selectStyle}>
            <option value="">All librarians</option>
            {options?.librarians.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-ink-700 font-medium" style={small}>
          Action
          <select value={filters.action ?? ""} onChange={(e) => setFilter("action", e.target.value)} className={selectClass} style={selectStyle}>
            <option value="">All actions</option>
            {options?.actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-(--radius) border border-danger/30 bg-danger-bg px-4 py-3 text-danger" style={body}>{error}</p>
      )}

      <div className="bg-white rounded-(--radius) border border-ink-200 overflow-x-auto">
        <table className="w-full text-left" style={body}>
          <thead>
            <tr className="border-b border-ink-200 text-ink-500" style={small}>
              <th scope="col" className="px-4 py-2.5 font-semibold whitespace-nowrap">Date and time</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Librarian</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Action</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {result?.items.map((entry) => (
              <tr key={entry.id} className="align-top">
                <td className="px-4 py-2.5 text-ink-500 whitespace-nowrap">{WHEN.format(new Date(entry.created_at))}</td>
                <td className="px-4 py-2.5 text-ink-900 whitespace-nowrap">{entry.librarian_name}</td>
                <td className="px-4 py-2.5 text-ink-900 whitespace-nowrap">{entry.action_label}</td>
                <td className="px-4 py-2.5 text-ink-500 wrap-anywhere" style={small}>{detailText(entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result && !error && <p className="px-4 py-4 text-ink-400" style={body}>Loading…</p>}
        {result?.items.length === 0 && <p className="px-4 py-4 text-ink-400" style={body}>No actions match these filters.</p>}
      </div>

      {result && result.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-ink-500" style={small}>{result.total.toLocaleString()} action{result.total === 1 ? "" : "s"}</p>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      {exportFormat && (
        <ReportExportDialog request={exportRequest} initialFormat={exportFormat} onClose={() => setExportFormat(null)} />
      )}
    </div>
  )
}
