// apps/web/components/ui/patrons/PatronProfileModal.tsx
// Sprint 5.5.2 — user profile view modal
// Tabs: Active Loans · Reservations · History
//
// Backed by the real GET /loans?student_id= and GET /reservations?user_id=
// endpoints (this patron's own rows only) instead of the Sprint 5.5 mock
// data — every real account was showing "0" across all three tabs since
// lib/mock/patrons.ts only ever had entries for four fake patron ids.

"use client"

import { useEffect, useMemo, useState } from "react"
import { X, BookOpen, Bookmark, History, Mail, GraduationCap, UserX, UserCheck, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile, Reservation, ReservationStatus } from "@lasallia/types"
import { fetchLoans, type Loan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import { updatePatron } from "@/lib/users"
import { RoleBadge } from "./RoleBadge"
import { AccountStatusPill } from "./AccountStatusPill"

type Tab = "loans" | "reservations" | "history"

type PatronProfileModalProps = {
  patron: UserProfile
  onClose: () => void
  onToggleStatus: () => void
  /** Fires after a successful Program/Year Level save, with the updated
   * record, so the parent page's list/selection stay in sync — same
   * reasoning handleToggleStatus already updates the parent's state. */
  onUpdated: (patron: UserProfile) => void
}

const DUE_SOON_DAYS = 3
const MAX_YEAR_LEVEL = 8 // matches routers/patrons.py's own ceiling

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

const LOAN_CFG = {
  active:   { label: "Active",   text: "text-success", bg: "bg-success-bg" },
  due_soon: { label: "Due Soon", text: "text-warn",    bg: "bg-warn-bg" },
  overdue:  { label: "Overdue",  text: "text-danger",  bg: "bg-danger-bg" },
}

// Keyed by the real ReservationStatus values (pending/ready/fulfilled/
// cancelled/expired) — same five the librarian Reservation Queue page
// already uses, so a patron's status reads the same everywhere.
const RES_CFG: Record<ReservationStatus, { label: string; text: string; bg: string }> = {
  pending:   { label: "Pending",   text: "text-warn",    bg: "bg-warn-bg" },
  ready:     { label: "Ready",     text: "text-success", bg: "bg-success-bg" },
  fulfilled: { label: "Picked Up", text: "text-ink-500", bg: "bg-ink-100" },
  cancelled: { label: "Cancelled", text: "text-ink-400", bg: "bg-ink-100" },
  expired:   { label: "Expired",   text: "text-ink-400", bg: "bg-ink-100" },
}

const HISTORY_CFG = {
  returned:         { label: "Returned",      text: "text-success", bg: "bg-success-bg" },
  overdue_returned: { label: "Returned Late", text: "text-warn",    bg: "bg-warn-bg" },
}

export function PatronProfileModal({ patron, onClose, onToggleStatus, onUpdated }: PatronProfileModalProps) {
  const [tab, setTab] = useState<Tab>("loans")
  const isActive = patron.status !== "inactive"

  // Academic/department info — Program (every real role except guest,
  // who never has a persistent account) and Year Level (student only —
  // a librarian or faculty account has no year to speak of). Every real
  // account has these null today; nothing before this ever let a
  // librarian set them, which is why the Patrons table showed "—" across
  // the board, librarian row included. Component remounts per patron
  // (see patrons/page.tsx: `{viewing && <PatronProfileModal patron={viewing}.../>}`
  // unmounts on close), so a plain useState initializer is safe here.
  const showProgram = patron.role !== "guest"
  const showYearLevel = patron.role === "student"
  const programLabel = patron.role === "librarian" ? "Department" : "Program"
  const [program, setProgram] = useState(patron.program ?? "")
  const [yearLevel, setYearLevel] = useState(patron.year_level ? String(patron.year_level) : "")
  const [academicSaving, setAcademicSaving] = useState(false)
  const [academicError, setAcademicError] = useState("")
  const [toast, setToast] = useState<string | null>(null)

  const academicDirty =
    program.trim() !== (patron.program ?? "") || yearLevel !== (patron.year_level ? String(patron.year_level) : "")

  const academicValidationError = (() => {
    if (!showYearLevel || !yearLevel) return null
    const n = Number(yearLevel)
    if (!Number.isInteger(n) || n < 1 || n > MAX_YEAR_LEVEL) return `Year Level must be a whole number from 1 to ${MAX_YEAR_LEVEL}.`
    return null
  })()

  async function handleSaveAcademicInfo() {
    if (academicValidationError) {
      setAcademicError(academicValidationError)
      return
    }
    setAcademicSaving(true)
    setAcademicError("")
    try {
      const updated = await updatePatron(patron.id, {
        program: showProgram ? program.trim() || null : undefined,
        year_level: showYearLevel ? (yearLevel ? Number(yearLevel) : null) : undefined,
      })
      onUpdated(updated)
      setToast("Saved.")
      setTimeout(() => setToast(null), 2000)
    } catch (err) {
      setAcademicError(err instanceof Error ? err.message : "Could not save this patron's info")
    } finally {
      setAcademicSaving(false)
    }
  }

  const [loans, setLoans] = useState<Loan[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  // Captured once the fetch below resolves, not read live during render —
  // Date.now() is an impure call the render path can't call directly.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchLoans(patron.id), fetchReservations(patron.id)])
      .then(([l, r]) => {
        if (cancelled) return
        setLoans(l)
        setReservations(r)
        setNow(Date.now())
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingActivity(false) })
    return () => { cancelled = true }
  }, [patron.id])

  const activeLoans = useMemo(() => loans.filter((l) => l.status === "active" || l.status === "overdue"), [loans])
  const returnedLoans = useMemo(() => loans.filter((l) => l.status === "returned" && l.returned_at), [loans])

  // full_name is nullable (a profile from Supabase Auth signup doesn't
  // require one) — fall back rather than crash on a patron nobody's
  // named yet. Initials still derive from the email (so there's always
  // something to show in the avatar); the heading says so plainly
  // instead of just repeating the email that's already shown below it.
  const displayName = patron.full_name || "No name on file"
  const initials = (patron.full_name || patron.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "loans",        label: "Active Loans",  icon: <BookOpen size={14} />, count: activeLoans.length },
    { key: "reservations", label: "Reservations",  icon: <Bookmark size={14} />, count: reservations.length },
    { key: "history",      label: "History",       icon: <History size={14} />,  count: returnedLoans.length },
  ]

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-4xl h-[94vh] sm:h-[85vh] max-h-[900px] bg-white rounded-t-(--radius-lg) sm:rounded-(--radius-lg) shadow-(--shadow-lg) flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-ink-100 shrink-0">
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div
              className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0 w-11 h-11 sm:w-[52px] sm:h-[52px]"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h2
                className="text-ink-900 font-semibold truncate"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
              >
                {displayName}
              </h2>
              <div className="flex items-center gap-1.5 text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                <Mail size={13} className="shrink-0" />
                <span className="truncate">{patron.email}</span>
              </div>
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
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 sm:py-3.5 border-b border-ink-100 shrink-0">
          <RoleBadge role={patron.role} />
          <AccountStatusPill status={patron.status ?? "active"} />
        </div>

        {/* Academic info — Program + Year Level, editable. Every real
            account has these null until a librarian sets them here. */}
        {(showProgram || showYearLevel) && (
          <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 border-b border-ink-100 shrink-0">
            <GraduationCap size={15} className="text-ink-400 mb-2.5 shrink-0" />
            {showProgram && (
              <label className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}>
                  {programLabel}
                </span>
                <input
                  type="text"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder={patron.role === "librarian" ? "e.g. LRC Staff" : "e.g. BS Computer Science"}
                  className="px-2.5 py-1.5 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors focus:border-green-700 focus:ring-1 focus:ring-green-700 hover:border-ink-300 min-w-0"
                  style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
                />
              </label>
            )}
            {showYearLevel && (
              <label className="flex flex-col gap-1 w-28 shrink-0">
                <span className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}>
                  Year Level
                </span>
                <input
                  type="number"
                  min={1}
                  max={MAX_YEAR_LEVEL}
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value)}
                  placeholder="1"
                  className="px-2.5 py-1.5 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors focus:border-green-700 focus:ring-1 focus:ring-green-700 hover:border-ink-300"
                  style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={handleSaveAcademicInfo}
              disabled={academicSaving || !academicDirty || !!academicValidationError}
              className="px-3 py-1.5 rounded-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-ink-900 text-white hover:bg-ink-700 shrink-0"
              style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
            >
              {academicSaving ? "Saving…" : "Save"}
            </button>

            {academicError && (
              <p className="flex items-center gap-1.5 text-danger w-full" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
                <AlertCircle size={12} className="shrink-0" />
                {academicError}
              </p>
            )}
          </div>
        )}

        {toast && (
          <div
            className="fixed bottom-6 right-6 z-[10000] bg-ink-900 text-white px-4 py-2.5 rounded-(--radius) shadow-lg"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {toast}
          </div>
        )}

        {/* Tabs */}
        <div className="flex px-4 sm:px-6 border-b border-ink-100 shrink-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2.5 sm:py-3 border-b-2 transition-colors whitespace-nowrap shrink-0",
                tab === t.key
                  ? "border-green-700 text-green-800 font-semibold"
                  : "border-transparent text-ink-400 hover:text-ink-700"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {t.icon}
              {t.label}
              <span
                className={cn(
                  "flex items-center justify-center rounded-full min-w-[18px] h-[18px] px-1 font-semibold",
                  tab === t.key ? "bg-green-100 text-green-800" : "bg-ink-100 text-ink-500"
                )}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loadingActivity ? (
            <div className="flex items-center justify-center py-10 text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              Loading…
            </div>
          ) : (
            <>
              {tab === "loans" && (
                <ActivityList
                  empty="No active loans."
                  items={activeLoans.map((l) => {
                    const daysLeft = (new Date(l.due_date).getTime() - (now ?? 0)) / 86_400_000
                    const status = l.status === "overdue" || daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "active"
                    return {
                      key: l.id,
                      title: l.books?.title ?? "Unknown title",
                      line1: `Borrowed ${formatDate(l.borrowed_at)}`,
                      line2: `Due ${formatDate(l.due_date)}`,
                      cfg: LOAN_CFG[status],
                    }
                  })}
                />
              )}
              {tab === "reservations" && (
                <ActivityList
                  empty="No reservations."
                  items={reservations.map((r) => ({
                    key: r.id,
                    title: r.books?.title ?? "Unknown title",
                    line1: `Requested ${formatDate(r.requested_at)}`,
                    line2: r.status === "ready" && r.pickup_by ? `Pickup by ${formatDate(r.pickup_by)}` : undefined,
                    cfg: RES_CFG[r.status],
                  }))}
                />
              )}
              {tab === "history" && (
                <ActivityList
                  empty="No borrowing history yet."
                  items={returnedLoans.map((l) => {
                    const wasLate = new Date(l.returned_at!).getTime() > new Date(l.due_date).getTime()
                    return {
                      key: l.id,
                      title: l.books?.title ?? "Unknown title",
                      line1: `Borrowed ${formatDate(l.borrowed_at)}`,
                      line2: `Returned ${formatDate(l.returned_at!)}`,
                      cfg: HISTORY_CFG[wasLate ? "overdue_returned" : "returned"],
                    }
                  })}
                />
              )}
            </>
          )}
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
          <button
            type="button"
            onClick={onToggleStatus}
            className={cn(
              "flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-sm transition-colors font-semibold",
              isActive ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-green-700 text-white hover:bg-green-800"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {isActive ? <UserX size={14} /> : <UserCheck size={14} />}
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ActivityList({
  items,
  empty,
}: {
  items: { key: string; title: string; line1: string; line2?: string; cfg: { label: string; text: string; bg: string } }[]
  empty: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-ink-300">
        <BookOpen size={26} />
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{empty}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-(--radius) border border-ink-100 bg-ink-50/40"
        >
          <div className="min-w-0">
            <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              {item.title}
            </p>
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              {item.line1}{item.line2 ? ` · ${item.line2}` : ""}
            </p>
          </div>
          <span
            className={cn("shrink-0 px-2.5 py-0.5 rounded-full font-semibold", item.cfg.bg, item.cfg.text)}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {item.cfg.label}
          </span>
        </li>
      ))}
    </ul>
  )
}