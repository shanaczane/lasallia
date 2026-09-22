// apps/web/components/ui/requests/BookRequestDetailModal.tsx
// Sprint 5.6 — full-detail view for a single faculty book request, opened
// by clicking a row in the librarian Reports > Requests "Wishlist and
// request log" table. Shows every field the table row collapses (note,
// ISBN, course, review timestamps) plus each attachment the faculty
// member uploaded, with view/download actions — the table row already
// links attachments inline, this is the same data in a fuller view.

"use client"

import { X, Paperclip, Download, Mail, GraduationCap, Hash, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BookRequest, BookRequestStatus } from "@/lib/bookRequests"

const REQUEST_STATUS_LABEL: Record<BookRequestStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected", fulfilled: "Fulfilled", cancelled: "Cancelled",
}
const REQUEST_STATUS_BADGE: Record<BookRequestStatus, string> = {
  pending: "bg-warn-bg text-warn",
  approved: "bg-info-bg text-info",
  rejected: "bg-danger-bg text-danger",
  fulfilled: "bg-success-bg text-success",
  cancelled: "bg-ink-100 text-ink-500",
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-ink-400 uppercase font-semibold"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
      >
        {label}
      </p>
      <p className="text-ink-900" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
        {value}
      </p>
    </div>
  )
}

type BookRequestDetailModalProps = {
  request: BookRequest
  onClose: () => void
  onDecision: (status: BookRequestStatus) => void
  busy: boolean
}

export function BookRequestDetailModal({ request: r, onClose, onDecision, busy }: BookRequestDetailModalProps) {
  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-4xl h-[92vh] sm:h-[86vh] max-h-[900px] bg-white rounded-t-(--radius-lg) sm:rounded-(--radius-lg) shadow-(--shadow-lg) flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-ink-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center rounded-full bg-green-200 text-green-800 shrink-0 w-11 h-11">
              <BookOpen size={19} />
            </div>
            <div className="min-w-0">
              <p
                className="text-ink-400 uppercase font-semibold"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}
              >
                Book Request
              </p>
              <h2
                className="text-ink-900 font-semibold truncate"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
              >
                {r.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:px-6 py-3 border-b border-ink-100 shrink-0">
          <span
            className={cn("inline-flex items-center px-2.5 py-1 rounded-pill font-medium", REQUEST_STATUS_BADGE[r.status])}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {REQUEST_STATUS_LABEL[r.status]}
          </span>
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            Requested {formatDate(r.created_at)}
          </p>
          {r.status === "pending" && r.updated_at !== r.created_at && (
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              Edited {formatDate(r.updated_at)}
            </p>
          )}
          {r.reviewed_at && (
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              Reviewed {formatDate(r.reviewed_at)}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5">
          {/* Requester */}
          <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-sm border border-ink-200 bg-ink-50">
            <div className="min-w-0">
              <p
                className="text-ink-400 uppercase font-semibold"
                style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}
              >
                Requested By
              </p>
              <p className="text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                {r.profiles?.full_name ?? "Unknown"}
              </p>
            </div>
            <div className="flex flex-col gap-1 items-start sm:items-end">
              <div className="flex items-center gap-1.5 text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                <Mail size={13} className="shrink-0" />
                {r.profiles?.email ?? "—"}
              </div>
              {r.profiles?.college && (
                <div className="flex items-center gap-1.5 text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                  <GraduationCap size={13} className="shrink-0" />
                  {r.profiles.college}
                </div>
              )}
            </div>
          </div>

          {/* Title details */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Author" value={r.author ?? "—"} />
            <Field label="ISBN" value={r.isbn ?? "—"} />
            <Field label="Format" value={r.format === "either" ? "Print or eBook" : r.format === "print" ? "Print" : "eBook"} />
            <Field label="Copies" value={String(r.copies)} />
            {r.course && <Field label="Course" value={r.course} />}
          </div>

          {r.note && (
            <div>
              <p
                className="text-ink-400 uppercase font-semibold mb-1"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
              >
                Note
              </p>
              <p className="text-ink-700 whitespace-pre-wrap" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                {r.note}
              </p>
            </div>
          )}

          {/* Attachments */}
          <div>
            <p
              className="text-ink-400 uppercase font-semibold mb-2"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
            >
              Attachments {r.attachments.length > 0 && `(${r.attachments.length})`}
            </p>
            {r.attachments.length === 0 ? (
              <p className="text-ink-300" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                No files were attached to this request.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-sm border border-ink-200 bg-white"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={14} className="text-ink-400 shrink-0" />
                      <span className="text-ink-900 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                        {a.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-700 hover:text-green-900 font-medium transition-colors"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                      >
                        View
                      </a>
                      <a
                        href={a.url}
                        download={a.name}
                        className="flex items-center gap-1 text-ink-500 hover:text-ink-800 font-medium transition-colors"
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                      >
                        <Download size={12} />
                        Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 p-4 sm:p-5 border-t border-ink-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-sm text-ink-600 hover:bg-ink-100 transition-colors font-medium"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Close
          </button>
          {r.status === "pending" ? (
            <>
              <button
                type="button"
                onClick={() => onDecision("rejected")}
                disabled={busy}
                className="px-4 py-2.5 rounded-sm border border-ink-200 bg-white text-ink-700 hover:bg-ink-100 disabled:opacity-40 transition-colors font-medium"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => onDecision("approved")}
                disabled={busy}
                className="px-4 py-2.5 rounded-sm bg-green-700 text-white hover:bg-green-800 disabled:opacity-40 transition-colors font-semibold"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
                Approve
              </button>
            </>
          ) : r.status === "approved" ? (
            <button
              type="button"
              onClick={() => onDecision("fulfilled")}
              disabled={busy}
              className="px-4 py-2.5 rounded-sm bg-gold-500 text-white hover:bg-gold-600 disabled:opacity-40 transition-colors font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              Mark Fulfilled
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
