// apps/web/app/student/requests/page.tsx
// Faculty-only "request a book" form + a self-service history of what
// they've submitted. Lives under /student because faculty share the whole
// student route tree (require_student, core/deps.py) — StudentLayout only
// shows the nav link when role === 'faculty', but this page still checks
// for itself since a student could type the URL directly; the real gate is
// require_faculty on the API (routers/book_requests.py).

"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { BookPlus, Clock, CheckCircle2, XCircle, PackageCheck, Paperclip, X, Ban, ChevronUp, ChevronDown } from "lucide-react"
import { getUser } from "@/lib/auth"
import {
  createBookRequest,
  uploadRequestAttachments,
  fetchMyBookRequests,
  type BookRequest,
  type BookRequestStatus,
  type BookRequestFormat,
} from "@/lib/bookRequests"
import { MyBookRequestModal } from "@/components/ui/requests/MyBookRequestModal"
import { resolveDateRange, type DateRangePreset } from "@/lib/reports"

// Same chevron-as-background-image treatment used by the librarian
// Reservations/Reports pages' own selects, so every select on the site
// looks the same instead of falling back to the OS's native arrow.
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

const STATUS_CONFIG: Record<BookRequestStatus, { label: string; icon: React.ReactNode; badge: string }> = {
  pending:   { label: "Pending",   icon: <Clock size={12} />,        badge: "bg-warn-bg text-warn" },
  approved:  { label: "Approved",  icon: <CheckCircle2 size={12} />, badge: "bg-info-bg text-info" },
  rejected:  { label: "Rejected",  icon: <XCircle size={12} />,      badge: "bg-danger-bg text-danger" },
  fulfilled: { label: "Fulfilled", icon: <PackageCheck size={12} />, badge: "bg-success-bg text-success" },
  cancelled: { label: "Cancelled", icon: <Ban size={12} />,          badge: "bg-ink-100 text-ink-500" },
}

const FORMAT_LABEL: Record<BookRequestFormat, string> = {
  print: "Print", ebook: "eBook", either: "Either format",
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

type FilterKey = "all" | BookRequestStatus

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
]

// No "custom" here — keep it to quick presets for a self-service history
// list. Same DateRangePreset/resolveDateRange the librarian Reports page
// uses, so "This month" means the same thing in both places.
const DATE_FILTERS: { key: DateRangePreset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "semester", label: "Semester" },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

export default function RequestABookPage() {
  // null = role not checked yet — avoids a flash of the "faculty only"
  // message for an actual faculty account before getUser() resolves.
  const [isFaculty, setIsFaculty] = useState<boolean | null>(null)
  const [requests, setRequests] = useState<BookRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [dateFilter, setDateFilter] = useState<DateRangePreset>("all")

  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [isbn, setIsbn] = useState("")
  const [note, setNote] = useState("")
  const [format, setFormat] = useState<BookRequestFormat>("either")
  const [copies, setCopies] = useState(1)
  const [course, setCourse] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setIsFaculty(getUser()?.role === "faculty")
  }, [])

  function load() {
    setLoading(true)
    fetchMyBookRequests().then(setRequests).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (isFaculty) load()
  }, [isFaculty])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = "" // lets picking the same file again re-add it after removal
    if (picked.length === 0) return
    const tooBig = picked.find((f) => f.size > MAX_ATTACHMENT_BYTES)
    if (tooBig) {
      setError(`'${tooBig.name}' is over 10 MB`)
      return
    }
    setError("")
    setFiles((prev) => [...prev, ...picked])
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError("")
    try {
      const created = await createBookRequest({
        title: title.trim(),
        author: author.trim() || undefined,
        isbn: isbn.trim() || undefined,
        note: note.trim() || undefined,
        format,
        copies,
        course: course.trim() || undefined,
      })
      // Attachments are a separate call (the request needs an id to attach
      // to first) — if this leg fails, the request itself is already
      // submitted, so surface it as a warning rather than losing the
      // request from view.
      if (files.length > 0) {
        try {
          await uploadRequestAttachments(created.id, files)
        } catch (err) {
          setError(`Request submitted, but the attachments failed to upload: ${err instanceof Error ? err.message : "unknown error"}`)
        }
      }
      setTitle(""); setAuthor(""); setIsbn(""); setNote(""); setCourse("")
      setFormat("either"); setCopies(1); setFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ""
      setJustSubmitted(true)
      setTimeout(() => setJustSubmitted(false), 3000)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request")
    } finally {
      setSubmitting(false)
    }
  }

  if (isFaculty === null) return null

  if (!isFaculty) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-paper items-center justify-center px-4 text-center gap-2">
        <BookPlus size={28} className="text-ink-300" />
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Requesting new titles is available to faculty accounts.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-paper">
      <div className="px-4 sm:px-8 pt-6 pb-4">
        <h1 className="text-ink-900 font-semibold leading-tight" style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}>
          Request a Book
        </h1>
        <p className="text-ink-500 mt-1" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
          Ask the LRC to acquire a title for the collection. A librarian reviews every request.
        </p>
      </div>

      <div className="px-4 sm:px-8 pb-8 flex flex-col gap-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="bg-white rounded-(--radius) border border-ink-200 p-4 sm:p-5 flex flex-col gap-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                Title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                Author
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                ISBN
              </label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="Optional"
                className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
                style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as BookRequestFormat)}
                className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 bg-white"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
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
                  className="px-3 py-2 pr-7 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 w-full"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
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
              Course / program (optional)
            </label>
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. CS 302 — Software Engineering"
              className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              Why is this needed? (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. required reading for a course, research reference…"
              className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 resize-none"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              Attach files (optional)
            </label>
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              A reading list, a screenshot of the listing, a price quote — JPG, PNG, WebP, or PDF, up to 10 MB each.
            </p>
            {files.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-1">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-sm border border-ink-200 bg-ink-50">
                    <Paperclip size={14} className="text-ink-400 shrink-0" />
                    <span className="text-ink-700 truncate flex-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${f.name}`}
                      className="text-ink-400 hover:text-ink-700 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="text-ink-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-sm file:border file:border-ink-200 file:bg-white file:text-ink-700 file:font-medium hover:file:bg-ink-50 file:transition-colors file:cursor-pointer cursor-pointer"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            />
          </div>

          {error && (
            <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>{error}</p>
          )}
          {justSubmitted && (
            <p className="text-success" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>Request submitted.</p>
          )}

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="self-start px-4 py-2.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </form>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p
              className="text-ink-500 uppercase font-semibold"
              style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}
            >
              My Requests
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateRangePreset)}
                aria-label="Filter by date"
                className="appearance-none bg-white border border-ink-200 text-ink-700 rounded-sm pl-3 pr-7 py-1.5 focus:outline-none focus:border-green-700 hover:border-ink-300 cursor-pointer transition-colors"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  backgroundImage: `url("${SELECT_CHEVRON}")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                }}
              >
                {DATE_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterKey)}
                aria-label="Filter by status"
                className="appearance-none bg-white border border-ink-200 text-ink-700 rounded-sm pl-3 pr-7 py-1.5 focus:outline-none focus:border-green-700 hover:border-ink-300 cursor-pointer transition-colors"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  backgroundImage: `url("${SELECT_CHEVRON}")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                }}
              >
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>
          {(() => {
            const { dateFrom, dateTo } = resolveDateRange(dateFilter, "", "")
            const inRange = requests.filter((r) => {
              const t = new Date(r.created_at).getTime()
              if (dateFrom && t < new Date(dateFrom).getTime()) return false
              if (dateTo && t > new Date(dateTo).getTime()) return false
              return true
            })
            const visible = filter === "all" ? inRange : inRange.filter((r) => r.status === filter)
            if (loading) {
              return <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>Loading…</p>
            }
            if (visible.length === 0) {
              return (
                <div
                  className="bg-white rounded-(--radius) border border-ink-200 p-6 flex items-center justify-center text-ink-400"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {requests.length === 0 ? "No requests yet." : "No requests match this filter."}
                </div>
              )
            }
            return (
            <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
              {visible.map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer hover:bg-ink-50 transition-colors",
                    i !== visible.length - 1 && "border-b border-ink-100"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {r.title}
                    </p>
                    <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                      {r.author ? `${r.author} · ` : ""}{FORMAT_LABEL[r.format]} · {r.copies} {r.copies === 1 ? "copy" : "copies"}
                      {r.course ? ` · ${r.course}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                        Requested {formatDate(r.created_at)}
                      </p>
                      {r.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-green-700 hover:text-green-900 transition-colors"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                        >
                          <Paperclip size={12} />
                          {a.name}
                        </a>
                      ))}
                    </div>
                  </div>
                  <span
                    className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-pill font-semibold shrink-0", STATUS_CONFIG[r.status].badge)}
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                  >
                    {STATUS_CONFIG[r.status].icon}
                    {STATUS_CONFIG[r.status].label}
                  </span>
                </div>
              ))}
            </div>
            )
          })()}
        </div>
      </div>

      {selectedId && (() => {
        const selected = requests.find((req) => req.id === selectedId)
        if (!selected) return null
        return (
          <MyBookRequestModal
            request={selected}
            onClose={() => setSelectedId(null)}
            onUpdated={(updated) => setRequests((prev) => prev.map((req) => (req.id === updated.id ? updated : req)))}
          />
        )
      })()}
    </div>
  )
}
