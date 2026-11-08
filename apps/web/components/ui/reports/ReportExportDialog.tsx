// Export a report as PDF, Excel or CSV, built by the API in the shared
// report layout. On open it loads the key figures and asks the AI for a
// summary draft the librarian reviews and can edit; if AI isn't available
// it falls back to the computed summary and says so. The key figures are
// always printed separately, computed by the server.
//
// Mount it only while open (the parent renders it conditionally), so every
// open starts fresh.

"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, AlertTriangle, Download, FileText, Loader2, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDialogKeyboard } from "@/lib/hooks/useDialogKeyboard"
import { useActiveLibrarian } from "@/components/layout/LibrarianProfileGate"
import {
  downloadReportExport,
  fetchExportAiSummary,
  fetchExportPreview,
  type ReportExportFormat,
  type ReportExportPreview,
  type ReportExportRequest,
  type ReportSignatureTitle,
} from "@/lib/reports"

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" } as const
const small = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" } as const
const label = { fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" } as const

const FORMATS: { value: ReportExportFormat; label: string; hint: string }[] = [
  { value: "pdf", label: "PDF", hint: "To print and sign" },
  { value: "xlsx", label: "Excel", hint: "Same layout, editable" },
  { value: "csv", label: "CSV", hint: "Table only, for other systems" },
]

// The names typed last time on this device. The LRC shares one librarian
// account, so names aren't saved on the server.
const NAMES_KEY = "lasallia.report-signatories"
type Names = Record<ReportSignatureTitle["key"], string>
const NO_NAMES: Names = { prepared_by: "", noted_by: "", approved_by: "" }

function loadNames(): Names {
  try {
    return { ...NO_NAMES, ...JSON.parse(window.localStorage.getItem(NAMES_KEY) ?? "{}") }
  } catch {
    return NO_NAMES
  }
}

function saveNames(names: Names) {
  try {
    window.localStorage.setItem(NAMES_KEY, JSON.stringify(names))
  } catch {
    // Private windows can refuse; the names just won't be remembered.
  }
}

export function ReportExportDialog({
  request, initialFormat = "pdf", onClose,
}: {
  request: ReportExportRequest
  initialFormat?: ReportExportFormat
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(dialogRef, { open: true, onClose })

  const [format, setFormat] = useState<ReportExportFormat>(initialFormat)
  // CSV only: the main table, or the details table when the report has one.
  const [csvTable, setCsvTable] = useState<"main" | "details">("main")
  const [preview, setPreview] = useState<ReportExportPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  // undefined while the AI draft loads; null when AI isn't available.
  const [aiDraft, setAiDraft] = useState<string | null | undefined>(undefined)
  const [choice, setChoice] = useState<"ai" | "computed">("ai")
  const [edited, setEdited] = useState<string | null>(null)
  // Prepared by starts as whoever is using Lasallia; it can still be edited.
  const preparedBy = useActiveLibrarian()?.full_name
  const [names, setNames] = useState<Names>(() => {
    const saved = loadNames()
    return { ...saved, prepared_by: preparedBy ?? saved.prepared_by }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchExportPreview(request)
      .then((p) => { if (!cancelled) setPreview(p) })
      .catch((e) => { if (!cancelled) setPreviewError(e instanceof Error ? e.message : "Could not prepare the export") })
    fetchExportAiSummary(request)
      .then((s) => { if (!cancelled) setAiDraft(s) })
      .catch(() => { if (!cancelled) setAiDraft(null) })
    return () => { cancelled = true }
  }, [request])

  const usingAi = choice === "ai" && typeof aiDraft === "string"
  const source: "ai" | "computed" = usingAi ? "ai" : "computed"
  const draft = usingAi ? aiDraft : (preview?.computed_summary ?? "")
  const summary = edited ?? draft
  const waitingForSummary = choice === "ai" && aiDraft === undefined
  const placeholders = preview?.signature_titles.filter((t) => t.placeholder) ?? []
  const withLayout = format !== "csv"

  function pick(next: "ai" | "computed") {
    setChoice(next)
    setEdited(null)
  }

  async function download() {
    setBusy(true)
    setError(null)
    try {
      await downloadReportExport(request, {
        format,
        summary_source: source,
        csv_table: format === "csv" && preview?.details_title ? csvTable : undefined,
        summary_text: withLayout ? summary.trim() || undefined : undefined,
        prepared_by_name: names.prepared_by.trim() || undefined,
        noted_by_name: names.noted_by.trim() || undefined,
        approved_by_name: names.approved_by.trim() || undefined,
      })
      saveNames(names)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the report")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-210 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden"
      style={{ background: "rgba(20,21,15,0.55)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Export ${preview?.title ?? "report"}`}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-2xl p-6 flex flex-col gap-5 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 text-green-700 shrink-0">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
                Export {preview?.title ?? "report"}
              </p>
              <p className="text-ink-500 mt-0.5 leading-snug" style={small}>
                {preview ? preview.period : previewError ? "" : "Loading…"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 text-ink-400 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {previewError && (
          <p className="flex items-start gap-1.5 text-danger" style={small} role="alert">
            <AlertCircle size={13} className="mt-px shrink-0" /> {previewError}
          </p>
        )}

        {/* Format */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink-400 font-semibold uppercase mb-2" style={label}>Format</legend>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormat(f.value)}
                aria-pressed={format === f.value}
                className={cn(
                  "rounded-sm border px-3 py-2 text-left transition-colors",
                  format === f.value ? "border-green-700 bg-green-50" : "border-ink-200 hover:border-ink-300",
                )}
              >
                <span className="block text-ink-900 font-semibold" style={body}>{f.label}</span>
                <span className="block text-ink-500" style={small}>{f.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Key figures: always printed, computed by the server */}
        {preview && (
          <div className="flex flex-col gap-2">
            <p className="text-ink-400 font-semibold uppercase" style={label}>
              Key figures · {preview.row_count.toLocaleString()} {preview.row_count === 1 ? "row" : "rows"}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 rounded-sm bg-green-50 border border-green-100 px-3 py-2.5">
              {preview.key_figures.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-3 min-w-0">
                  <dt className="text-ink-500" style={small}>{f.label}</dt>
                  <dd className="text-ink-900 font-semibold text-right" style={small}>{f.value}</dd>
                </div>
              ))}
            </dl>
            {preview.filters.length > 0 && (
              <p className="text-ink-500" style={small}>{preview.filters.join(" · ")}</p>
            )}
            {!preview.uses_dates && (
              <p className="text-ink-500" style={small}>
                This report is a snapshot as of now, so the page&apos;s date range doesn&apos;t apply to it.
              </p>
            )}
          </div>
        )}

        {withLayout ? (
          <>
            {/* Summary */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-ink-400 font-semibold uppercase" style={label}>Summary</p>
                {typeof aiDraft === "string" && (
                  <button
                    type="button"
                    onClick={() => pick(choice === "ai" ? "computed" : "ai")}
                    className="text-green-700 hover:text-green-900 font-semibold underline underline-offset-2"
                    style={small}
                  >
                    {choice === "ai" ? "Use the computed summary instead" : "Use the AI draft instead"}
                  </button>
                )}
              </div>
              {waitingForSummary ? (
                <p className="flex items-center gap-2 text-ink-500 rounded-sm border border-ink-200 px-3 py-3" style={body}>
                  <Loader2 size={14} className="animate-spin" /> Drafting a summary…
                </p>
              ) : (
                <textarea
                  value={summary}
                  onChange={(e) => setEdited(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="w-full rounded-sm border border-ink-200 bg-white px-3 py-2 text-ink-900 focus:outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
                  style={body}
                  aria-label="Summary"
                />
              )}
              {!waitingForSummary && (
                <p className={cn("flex items-start gap-1.5", usingAi ? "text-ink-500" : "text-ink-600")} style={small}>
                  {usingAi ? (
                    <><Sparkles size={13} className="mt-px shrink-0 text-green-700" />
                      AI draft from the report&apos;s totals only. Check it against the key figures and edit it before
                      exporting. It&apos;s printed as &ldquo;AI-assisted draft, reviewed by the librarian&rdquo;.</>
                  ) : aiDraft === null ? (
                    <><AlertTriangle size={13} className="mt-px shrink-0 text-gold-600" />
                      AI isn&apos;t available right now, so this is the summary computed from the report data. You can
                      edit it.</>
                  ) : (
                    <>Computed from the report data. You can edit it.</>
                  )}
                </p>
              )}
            </div>

            {/* Signatures */}
            <div className="flex flex-col gap-2">
              <p className="text-ink-400 font-semibold uppercase" style={label}>Signature lines</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(preview?.signature_titles ?? []).map((t) => (
                  <label key={t.key} className="flex flex-col gap-1 min-w-0">
                    <span className="text-ink-700 font-medium" style={small}>{t.label}</span>
                    <input
                      value={names[t.key]}
                      onChange={(e) => setNames((n) => ({ ...n, [t.key]: e.target.value }))}
                      maxLength={120}
                      placeholder="Name (optional)"
                      className="w-full rounded-sm border border-ink-200 bg-white px-3 py-2 text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700"
                      style={body}
                    />
                    <span className={cn("truncate", t.placeholder ? "text-gold-600" : "text-ink-500")} style={small}>
                      {t.title}{t.placeholder ? " (placeholder)" : ""}
                    </span>
                  </label>
                ))}
              </div>
              {placeholders.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-sm border border-gold-500 bg-gold-100 px-3 py-2 text-ink-900" style={small}>
                  <AlertTriangle size={13} className="mt-px shrink-0 text-gold-600" />
                  <span>
                    {placeholders.map((t) => t.label).join(", ")}{" "}
                    {placeholders.length === 1 ? "uses a placeholder job title" : "use placeholder job titles"} until the
                    library confirms them. Change them in{" "}
                    <Link href="/librarian/settings" className="font-semibold underline underline-offset-2">Settings</Link>.
                  </span>
                </p>
              )}
              <p className="text-ink-400" style={small}>Leave a name blank to sign by hand. Names are remembered on this device only.</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {preview?.details_title && (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-ink-400 font-semibold uppercase mb-1" style={label}>Table</legend>
                {([
                  ["main", `${preview.title} (${preview.row_count.toLocaleString()} rows)`],
                  ["details", `${preview.details_title} (${preview.details_row_count.toLocaleString()} rows)`],
                ] as const).map(([value, text]) => (
                  <label key={value} className="flex items-center gap-2 text-ink-700 cursor-pointer" style={body}>
                    <input
                      type="radio"
                      name="csv-table"
                      checked={csvTable === value}
                      onChange={() => setCsvTable(value)}
                      className="accent-green-700"
                    />
                    {text}
                  </label>
                ))}
              </fieldset>
            )}
            <p className="text-ink-500" style={small}>
              The CSV has the table only (row 1 is the column names), so it opens cleanly in other systems. The period is
              in the file name.
              {preview?.details_title ? ` The Excel file has both tables, on separate sheets.` : ""}
            </p>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-danger" style={small} role="alert">
            <AlertCircle size={13} className="mt-px shrink-0" /> {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            style={body}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy || !preview || (withLayout && waitingForSummary)}
            className="px-5 py-2 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            style={body}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download {FORMATS.find((f) => f.value === format)?.label}
          </button>
        </div>
      </div>
    </div>
  )
}
