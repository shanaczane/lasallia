// apps/web/app/librarian/sync/page.tsx
// Catalog import — upload either the LRC's own Excel catalog sheet (what
// librarians can produce today, since they have no export access in
// Follett Destiny) or a Destiny MARC 21 export, preview what it would
// change, then confirm. One-way into Lasallia; never deletes and never
// changes a copy's circulation status — see apps/api/core/importers/.

"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileUp, History, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLLEGES } from "@/lib/colleges"
import {
  downloadTemplate,
  fetchSyncRuns,
  importCatalog,
  isSpreadsheet,
  type SyncIssue,
  type SyncItem,
  type SyncPreview,
  type SyncRun,
} from "@/lib/sync"

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  author: "Author",
  isbn: "ISBN",
  call_number: "Call number",
  publisher: "Publisher",
  published_year: "Year",
  abstract: "Description",
}

const MATCH_LABEL: Record<string, string> = {
  accession: "matched by accession no.",
  isbn: "matched by ISBN",
  title_author: "matched by title + author",
}

const body = (size = "var(--text-sm-body)") => ({ fontFamily: "var(--font-body)", fontSize: size })

// "CBEAM.xlsx" / "GRADUATE SCHOOL.xlsx" -> that college, matching how the
// existing per-college files are named. Empty when nothing matches.
function guessCollege(fileName: string): string {
  const upper = fileName.toUpperCase()
  return [...COLLEGES].sort((a, b) => b.length - a.length).find((c) => upper.includes(c)) ?? ""
}

function truncate(value: string | number | null, max = 80): string {
  if (value === null || value === "") return "—"
  const s = String(value)
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// ─── Toast ────────────────────────────────────────────────────────────────────
// Same pattern as app/librarian/patrons/page.tsx's Toast.

function Toast({ message, variant }: { message: string; variant: "success" | "error" }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-full shadow-(--shadow-lg) pointer-events-none max-w-[90vw]">
      {variant === "success" ? (
        <CheckCircle2 size={15} className="text-green-400 shrink-0" />
      ) : (
        <AlertCircle size={15} className="text-danger shrink-0" />
      )}
      <span style={body()}>{message}</span>
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "danger" | "muted" }) {
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 px-4 py-3">
      <p
        className="text-ink-400 font-semibold uppercase"
        style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-semibold mt-1",
          tone === "green" && "text-green-700",
          tone === "danger" && "text-danger",
          (!tone || tone === "muted") && "text-ink-900",
        )}
        style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}
      >
        {value}
      </p>
    </div>
  )
}

function ChangeRow({ item }: { item: SyncItem }) {
  return (
    <div className="px-4 py-3 border-b border-ink-100 last:border-b-0 flex flex-col gap-1.5">
      <div className="flex items-start gap-2 flex-wrap">
        <span
          className={cn(
            "px-2 py-0.5 rounded-full font-semibold shrink-0",
            item.action === "add" ? "bg-green-100 text-green-800" : "bg-gold-100 text-ink-800",
          )}
          style={body("var(--text-2xs)")}
        >
          {item.action === "add" ? "New title" : "Update"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink-900 font-medium" style={body()}>{item.title}</p>
          <p className="text-ink-400" style={body("var(--text-xs)")}>
            {item.author ?? "Unknown author"} · {item.location ?? `record ${item.record}`}
            {item.matched_by && ` · ${MATCH_LABEL[item.matched_by]}`}
            {item.archived && " · archived in Lasallia (stays archived)"}
          </p>
        </div>
      </div>

      {item.changes.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-1">
          {item.changes.map((c) => (
            <li key={c.field} className="text-ink-600" style={body("var(--text-xs)")}>
              <span className="font-semibold">{FIELD_LABEL[c.field] ?? c.field}:</span>{" "}
              <span className="line-through text-ink-400">{truncate(c.old)}</span> → {truncate(c.new)}
            </li>
          ))}
        </ul>
      )}

      {item.new_copies.length > 0 && (
        <p className="text-green-700 pl-1" style={body("var(--text-xs)")}>
          + {item.new_copies.length} new {item.new_copies.length === 1 ? "copy" : "copies"}:{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>{item.new_copies.join(", ")}</span>
        </p>
      )}

      {item.copies_not_in_export.length > 0 && (
        <p className="text-warn pl-1" style={body("var(--text-xs)")}>
          Not in this file (kept, not deleted):{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>{item.copies_not_in_export.join(", ")}</span>
        </p>
      )}
    </div>
  )
}

function IssueList({ issues, variant }: { issues: SyncIssue[]; variant: "error" | "warning" }) {
  const isError = variant === "error"
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
      <p
        className={cn("px-4 py-2.5 border-b border-ink-100 font-semibold flex items-center gap-2", isError ? "text-danger" : "text-warn")}
        style={body()}
      >
        {isError ? <AlertCircle size={15} /> : <AlertTriangle size={15} />}
        {isError
          ? `${issues.length} ${issues.length === 1 ? "row was" : "rows were"} skipped`
          : `${issues.length} possible ${issues.length === 1 ? "typo" : "typos"} — imported, but worth fixing in the sheet`}
      </p>
      <ul className="max-h-[260px] overflow-y-auto">
        {issues.map((e, i) => (
          <li key={i} className="px-4 py-2 border-b border-ink-100 last:border-b-0 text-ink-600" style={body("var(--text-xs)")}>
            <span className="font-semibold">{e.location ?? `Record ${e.record}`}</span>
            {e.title && <> · {e.title}</>} — {e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CatalogImportPage() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [college, setCollege] = useState("")
  const [preview, setPreview] = useState<SyncPreview | null>(null)
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null)

  function showToast(message: string, variant: "success" | "error") {
    setToast({ message, variant })
    setTimeout(() => setToast(null), 3000)
  }

  function loadRuns() {
    fetchSyncRuns().then(setRuns).catch(() => {})
  }

  useEffect(loadRuns, [])

  function chooseFile(next: File | null) {
    setFile(next)
    setCollege(next ? guessCollege(next.name) : "")
    setPreview(null)
    setError(null)
  }

  const spreadsheet = file !== null && isSpreadsheet(file)
  const collegeForUpload = spreadsheet ? college : undefined

  async function runPreview() {
    if (!file) return
    setBusy("preview")
    setError(null)
    try {
      setPreview(await importCatalog(file, true, collegeForUpload))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file")
    } finally {
      setBusy(null)
    }
  }

  async function applyImport() {
    if (!file) return
    setBusy("apply")
    try {
      const result = await importCatalog(file, false, collegeForUpload)
      setPreview(result)
      loadRuns()
      showToast(
        `Imported: ${result.books_added} new, ${result.books_updated} updated, ${result.copies_added} copies added.`,
        "success",
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : "The import failed", "error")
    } finally {
      setBusy(null)
    }
  }

  function reset() {
    chooseFile(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  const pendingChanges = preview ? preview.books_added + preview.books_updated : 0
  const applied = preview && !preview.dry_run

  return (
    <div className="p-4 sm:p-6 max-w-(--max-w-content) mx-auto flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
          >
            Catalog Import
          </h1>
          <p className="text-ink-400 mt-1 max-w-[680px]" style={body("var(--text-body)")}>
            Upload the LRC catalog Excel sheet (.xlsx), or a MARC 21 export (.mrc) from Follett Destiny. You&apos;ll see
            a preview and any likely typos before anything changes. Imports never delete books or change whether a copy
            is on loan.
          </p>
        </div>
        <button
          onClick={() =>
            downloadTemplate().catch((err) =>
              showToast(err instanceof Error ? err.message : "Could not download the template", "error"),
            )
          }
          className="px-3 py-1.5 rounded-sm border border-ink-200 bg-white text-ink-700 font-semibold hover:bg-ink-50 transition-colors flex items-center gap-1.5 shrink-0"
          style={body()}
        >
          <Download size={14} /> Excel template
        </button>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
          <span className="flex items-center justify-center rounded-(--radius) bg-green-50 text-green-700 shrink-0" style={{ width: 40, height: 40 }}>
            <FileUp size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-ink-900 font-medium truncate" style={body()}>
              {file ? file.name : "Choose a catalog file"}
            </span>
            <span className="block text-ink-400" style={body("var(--text-xs)")}>
              {file
                ? `${spreadsheet ? "Excel sheet" : "MARC export"} · ${(file.size / 1024).toFixed(0)} KB`
                : "Excel (.xlsx) or MARC 21 (.mrc), up to 25 MB"}
            </span>
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.mrc,.marc,.dat"
            className="sr-only"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {/* The sheets don't say which college they're for — the existing
            per-college files carry it in the file name, so it's prefilled
            from that when it matches. */}
        {spreadsheet && (
          <label className="flex flex-col gap-1 shrink-0">
            <span
              className="text-ink-400 font-semibold uppercase"
              style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}
            >
              College
            </span>
            <select
              value={college}
              onChange={(e) => {
                setCollege(e.target.value)
                setPreview(null)
              }}
              disabled={busy !== null}
              className="px-2 py-1.5 rounded-sm border border-ink-200 bg-white text-ink-800"
              style={body()}
            >
              <option value="">Select…</option>
              {COLLEGES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-2">
          {file && (
            <button
              onClick={reset}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-sm border border-ink-200 text-ink-600 font-semibold hover:bg-ink-50 transition-colors disabled:opacity-50"
              style={body()}
            >
              Clear
            </button>
          )}
          <button
            onClick={runPreview}
            disabled={!file || (spreadsheet && !college) || busy !== null}
            className="px-3 py-1.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            style={body()}
          >
            {busy === "preview" && <Loader2 size={14} className="animate-spin" />}
            Preview import
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-(--radius) border border-danger/30 bg-danger/5 px-4 py-3 text-danger" style={body()}>
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Preview / result */}
      {preview && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
              {applied ? "Import complete" : "Preview"}
            </h2>
            {!applied && (
              <button
                onClick={applyImport}
                disabled={pendingChanges === 0 || busy !== null}
                className="px-3 py-1.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                style={body()}
              >
                {busy === "apply" && <Loader2 size={14} className="animate-spin" />}
                {pendingChanges === 0
                  ? "Nothing to import"
                  : `Confirm import (${pendingChanges} ${pendingChanges === 1 ? "title" : "titles"})`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label={preview.source === "lrc_spreadsheet" ? "Rows read" : "Records read"} value={preview.records_read} />
            <Stat label="New titles" value={preview.books_added} tone="green" />
            <Stat label="Updated" value={preview.books_updated} />
            <Stat label="Unchanged" value={preview.books_unchanged} tone="muted" />
            <Stat label="New copies" value={preview.copies_added} tone="green" />
            <Stat label="Skipped" value={preview.errors.length} tone={preview.errors.length ? "danger" : "muted"} />
          </div>

          {preview.errors.length > 0 && <IssueList issues={preview.errors} variant="error" />}
          {preview.warnings.length > 0 && <IssueList issues={preview.warnings} variant="warning" />}

          {preview.items.length > 0 ? (
            <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
              <p className="px-4 py-2.5 border-b border-ink-100 text-ink-900 font-semibold" style={body()}>
                {applied ? "What changed" : "What will change"}
              </p>
              <div className="max-h-[520px] overflow-y-auto">
                {preview.items.map((item) => (
                  <ChangeRow key={`${item.record}-${item.title}`} item={item} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-ink-400" style={body()}>
              The catalog already matches this file — nothing to change.
            </p>
          )}
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
        <p className="px-4 py-2.5 border-b border-ink-100 text-ink-900 font-semibold flex items-center gap-2" style={body()}>
          <History size={15} className="text-ink-400" /> Import history
        </p>
        {runs.length === 0 ? (
          <p className="px-4 py-6 text-center text-ink-300" style={body()}>No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={body("var(--text-xs)")}>
              <thead>
                <tr
                  className="text-ink-400 uppercase border-b border-ink-100"
                  style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
                >
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">File</th>
                  <th className="px-4 py-2 font-semibold">By</th>
                  <th className="px-4 py-2 font-semibold text-right">New</th>
                  <th className="px-4 py-2 font-semibold text-right">Updated</th>
                  <th className="px-4 py-2 font-semibold text-right">Copies</th>
                  <th className="px-4 py-2 font-semibold text-right">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-ink-100 last:border-b-0 text-ink-700">
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 max-w-[240px] truncate">
                      {r.file_name ?? "—"}
                      <span className="text-ink-400"> · {r.source === "lrc_spreadsheet" ? "Excel" : "MARC"}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.started_by_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{r.books_added}</td>
                    <td className="px-4 py-2 text-right">{r.books_updated}</td>
                    <td className="px-4 py-2 text-right">{r.copies_added}</td>
                    <td className={cn("px-4 py-2 text-right", r.errors.length > 0 && "text-danger font-semibold")}>{r.errors.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </div>
  )
}
