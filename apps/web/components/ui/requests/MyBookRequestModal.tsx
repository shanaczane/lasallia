// apps/web/components/ui/requests/MyBookRequestModal.tsx
// Faculty-side view/edit for a single request on /student/requests. A
// request can be edited (title/author/isbn/format/copies/course/note, plus
// attachments) only while still "pending" — once a librarian has approved,
// rejected, or fulfilled it, this renders read-only. Backend enforces the
// same rule (PATCH /book-requests/{id}/edit, routers/book_requests.py).

"use client"

import { useState } from "react"
import { X, Paperclip, Download, Pencil, Trash2, Ban, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  updateMyBookRequest,
  cancelBookRequest,
  uploadRequestAttachments,
  deleteRequestAttachment,
  type BookRequest,
  type BookRequestStatus,
  type BookRequestFormat,
} from "@/lib/bookRequests"

const STATUS_LABEL: Record<BookRequestStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected", fulfilled: "Fulfilled", cancelled: "Cancelled",
}
const STATUS_BADGE: Record<BookRequestStatus, string> = {
  pending: "bg-warn-bg text-warn",
  approved: "bg-info-bg text-info",
  rejected: "bg-danger-bg text-danger",
  fulfilled: "bg-success-bg text-success",
  cancelled: "bg-ink-100 text-ink-500",
}
const FORMAT_LABEL: Record<BookRequestFormat, string> = {
  print: "Print", ebook: "eBook", either: "Either format",
}
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

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

const inputClass =
  "px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 w-full"
const inputStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }

type MyBookRequestModalProps = {
  request: BookRequest
  onClose: () => void
  onUpdated: (updated: BookRequest) => void
}

export function MyBookRequestModal({ request: r, onClose, onUpdated }: MyBookRequestModalProps) {
  const editable = r.status === "pending"
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [title, setTitle] = useState(r.title)
  const [author, setAuthor] = useState(r.author ?? "")
  const [isbn, setIsbn] = useState(r.isbn ?? "")
  const [note, setNote] = useState(r.note ?? "")
  const [format, setFormat] = useState<BookRequestFormat>(r.format)
  const [copies, setCopies] = useState(r.copies)
  const [course, setCourse] = useState(r.course ?? "")

  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    setCancelling(true)
    setError("")
    try {
      const updated = await cancelBookRequest(r.id)
      onUpdated(updated)
      setConfirmingCancel(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this request")
    } finally {
      setCancelling(false)
    }
  }

  function startEdit() {
    setTitle(r.title); setAuthor(r.author ?? ""); setIsbn(r.isbn ?? ""); setNote(r.note ?? "")
    setFormat(r.format); setCopies(r.copies); setCourse(r.course ?? "")
    setError("")
    setEditing(true)
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required")
      return
    }
    setSaving(true)
    setError("")
    try {
      const updated = await updateMyBookRequest(r.id, {
        title: title.trim(),
        author: author.trim(),
        isbn: isbn.trim(),
        note: note.trim(),
        format,
        copies,
        course: course.trim(),
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your changes")
    } finally {
      setSaving(false)
    }
  }

  async function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (picked.length === 0) return
    const tooBig = picked.find((f) => f.size > MAX_ATTACHMENT_BYTES)
    if (tooBig) {
      setError(`'${tooBig.name}' is over 10 MB`)
      return
    }
    setUploading(true)
    setError("")
    try {
      const updated = await uploadRequestAttachments(r.id, picked)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach these files")
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveAttachment(attachmentId: string) {
    setRemovingId(attachmentId)
    setError("")
    try {
      const updated = await deleteRequestAttachment(r.id, attachmentId)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this attachment")
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl h-[92vh] sm:h-[86vh] max-h-[900px] bg-white rounded-t-(--radius-lg) sm:rounded-(--radius-lg) shadow-(--shadow-lg) flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-ink-100 shrink-0">
          <div className="min-w-0">
            <p
              className="text-ink-400 uppercase font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}
            >
              Your Book Request
            </p>
            <h2
              className="text-ink-900 font-semibold truncate"
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
            >
              {editing ? "Edit Request" : r.title}
            </h2>
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
            className={cn("inline-flex items-center px-2.5 py-1 rounded-pill font-medium", STATUS_BADGE[r.status])}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {STATUS_LABEL[r.status]}
          </span>
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            Requested {formatDate(r.created_at)}
          </p>
          {r.status === "pending" && r.updated_at !== r.created_at && (
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              Edited {formatDate(r.updated_at)}
            </p>
          )}
          {!editable && (
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              {r.status === "cancelled"
                ? "You withdrew this request — it can no longer be edited."
                : "This request has already been reviewed and can no longer be edited."}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5">
          {error && (
            <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>{error}</p>
          )}

          {editing ? (
            <div className="flex flex-col gap-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    Title <span className="text-danger">*</span>
                  </label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    Author
                  </label>
                  <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    ISBN
                  </label>
                  <input type="text" value={isbn} onChange={(e) => setIsbn(e.target.value)} className={inputClass} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    Format
                  </label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as BookRequestFormat)} className={cn(inputClass, "bg-white")} style={inputStyle}>
                    {(Object.keys(FORMAT_LABEL) as BookRequestFormat[]).map((f) => (
                      <option key={f} value={f}>{FORMAT_LABEL[f]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    Copies needed
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={copies}
                      onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                      className={cn(inputClass, "pr-7")}
                      style={inputStyle}
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                      <button
                        type="button"
                        onClick={() => setCopies((c) => c + 1)}
                        aria-label="Increase copies"
                        className="text-ink-400 hover:text-green-700 transition-colors leading-none p-0.5"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCopies((c) => Math.max(1, c - 1))}
                        aria-label="Decrease copies"
                        className="text-ink-400 hover:text-green-700 transition-colors leading-none p-0.5"
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                  Course / program
                </label>
                <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                  Why is this needed?
                </label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cn(inputClass, "resize-none")} style={inputStyle} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Author" value={r.author ?? "—"} />
              <Field label="ISBN" value={r.isbn ?? "—"} />
              <Field label="Format" value={FORMAT_LABEL[r.format]} />
              <Field label="Copies" value={String(r.copies)} />
              {r.course && <Field label="Course" value={r.course} />}
              {r.note && (
                <div className="col-span-2">
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
            {r.attachments.length === 0 && !editable ? (
              <p className="text-ink-300" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                No files were attached to this request.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-sm border border-ink-200 bg-white">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={14} className="text-ink-400 shrink-0" />
                      <span className="text-ink-900 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                        {a.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:text-green-900 font-medium transition-colors" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                        View
                      </a>
                      <a href={a.url} download={a.name} className="flex items-center gap-1 text-ink-500 hover:text-ink-800 font-medium transition-colors" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                        <Download size={12} />
                        Download
                      </a>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(a.id)}
                          disabled={removingId === a.id}
                          aria-label={`Remove ${a.name}`}
                          className="text-ink-400 hover:text-danger disabled:opacity-40 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {editable && (
              <label className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 font-medium transition-colors cursor-pointer w-fit" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                <Paperclip size={13} />
                {uploading ? "Uploading…" : "Add a file"}
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleAddFiles}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Footer actions — destructive action (Cancel Request) always sits
            in its own slot on the left, separated from Close/Edit on the
            right, so it's never sandwiched between two harmless buttons
            where a misclick could withdraw a request by accident. Danger
            styling matches the soft-fill convention PatronProfileModal's
            Deactivate button already uses, not a bordered outline. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-4 sm:p-5 border-t border-ink-100 shrink-0">
          {editing ? (
            <>
              <div />
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setError("") }}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-sm text-ink-600 hover:bg-ink-100 transition-colors font-medium disabled:opacity-40"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !title.trim()}
                  className="px-4 py-2.5 rounded-sm bg-green-700 text-white hover:bg-green-800 disabled:opacity-40 transition-colors font-semibold"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          ) : confirmingCancel ? (
            <>
              <p className="text-ink-500 flex items-center" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                Withdraw this request? This can't be undone.
              </p>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancelling}
                  className="px-4 py-2.5 rounded-sm text-ink-600 hover:bg-ink-100 transition-colors font-medium disabled:opacity-40"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  No, Keep It
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="px-4 py-2.5 rounded-sm bg-danger text-white hover:opacity-90 disabled:opacity-40 transition-opacity font-semibold"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {cancelling ? "Cancelling…" : "Yes, Cancel Request"}
                </button>
              </div>
            </>
          ) : (
            <>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-sm bg-danger/10 text-danger hover:bg-danger/20 transition-colors font-semibold"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  <Ban size={14} />
                  Cancel Request
                </button>
              ) : (
                <div />
              )}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-sm text-ink-600 hover:bg-ink-100 transition-colors font-medium"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  Close
                </button>
                {editable && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-sm bg-green-700 text-white hover:bg-green-800 transition-colors font-semibold"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    <Pencil size={14} />
                    Edit Request
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
