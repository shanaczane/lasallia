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
import { X, BookOpen, Bookmark, History, Mail, UserX, UserCheck, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile, Reservation, ReservationStatus } from "@lasallia/types"
import { fetchLoans, settleFine, type Loan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import { RoleBadge } from "./RoleBadge"
import { AccountStatusPill } from "./AccountStatusPill"

type Tab = "loans" | "reservations" | "history" | "fines"

type PatronProfileModalProps = {
  patron: UserProfile
  onClose: () => void
  onToggleStatus: () => void
}

const DUE_SOON_DAYS = 3

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

// Bordered rectangular tags rather than filled pills — reads as a formal
// record label (ledger/registry style) instead of a casual chat badge.
const LOAN_CFG = {
  active:   { label: "Active",   text: "text-success", bg: "bg-success-bg", border: "border-success/30" },
  due_soon: { label: "Due Soon", text: "text-warn",    bg: "bg-warn-bg",    border: "border-warn/30" },
  overdue:  { label: "Overdue",  text: "text-danger",  bg: "bg-danger-bg",  border: "border-danger/30" },
}

// Keyed by the real ReservationStatus values (pending/ready/fulfilled/
// cancelled/expired) — same five the librarian Reservation Queue page
// already uses, so a patron's status reads the same everywhere.
const RES_CFG: Record<ReservationStatus, { label: string; text: string; bg: string; border: string }> = {
  pending:   { label: "Pending",   text: "text-warn",    bg: "bg-warn-bg",    border: "border-warn/30" },
  ready:     { label: "Ready",     text: "text-success", bg: "bg-success-bg", border: "border-success/30" },
  fulfilled: { label: "Picked Up", text: "text-ink-500", bg: "bg-ink-100",    border: "border-ink-300" },
  cancelled: { label: "Cancelled", text: "text-ink-400", bg: "bg-ink-100",    border: "border-ink-300" },
  expired:   { label: "Expired",   text: "text-ink-400", bg: "bg-ink-100",    border: "border-ink-300" },
}

const HISTORY_CFG = {
  returned:         { label: "Returned",      text: "text-success", bg: "bg-success-bg", border: "border-success/30" },
  overdue_returned: { label: "Returned Late", text: "text-warn",    bg: "bg-warn-bg",    border: "border-warn/30" },
}

type FineKind = "unsettled" | "accruing" | "paid"

// unsettled: a returned loan whose fine was never marked Paid at the desk.
// accruing: still out and already overdue — fine_amount doesn't exist yet
// (only return_loan sets it), so this previews what it'll be if returned
// today, same compute_fine the Reports overdue table already trusts.
const FINE_CFG: Record<FineKind, { label: string; text: string; bg: string; border: string }> = {
  unsettled: { label: "Unsettled", text: "text-danger",  bg: "bg-danger-bg",  border: "border-danger/30" },
  accruing:  { label: "Accruing",  text: "text-warn",    bg: "bg-warn-bg",    border: "border-warn/30" },
  paid:      { label: "Paid",      text: "text-success", bg: "bg-success-bg", border: "border-success/30" },
}

// Vocabularies the API stores (see schemas/loan.py's Condition/ReturnCondition)
// spelled out for a librarian reading a fine's reason, not the raw enum value.
const BORROW_CONDITION_LABEL: Record<string, string> = {
  good: "Good",
  minor_wear: "Minor wear",
  already_damaged: "Already damaged",
}
const RETURN_CONDITION_LABEL: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  damaged: "Damaged",
  incomplete: "Incomplete",
}

type FineEntry = {
  loanId: string
  title: string
  amount: number
  kind: FineKind
  detail: string
  /** Plain-language basis for the amount — only what's actually known
   * (dates, declared vs. found condition), never a fabricated peso-exact
   * overdue/damage split the frontend has no authoritative way to compute. */
  reasonLines: string[]
}

export function PatronProfileModal({ patron, onClose, onToggleStatus }: PatronProfileModalProps) {
  const [tab, setTab] = useState<Tab>("loans")
  const isActive = patron.status !== "inactive"

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

  const fineEntries = useMemo<FineEntry[]>(() => {
    const entries: FineEntry[] = []
    for (const l of loans) {
      const title = l.books?.title ?? "Unknown title"
      if (l.status === "returned" && (l.fine_amount ?? 0) > 0) {
        const paid = l.fine_status === "paid"
        const wasLateReturn = new Date(l.returned_at!).getTime() > new Date(l.due_date).getTime()
        const isNewDamage =
          l.condition_at_borrow === "good" && (l.condition_at_return === "damaged" || l.condition_at_return === "incomplete")

        const reasonLines: string[] = [
          `Borrowed ${formatDate(l.borrowed_at)} · Due ${formatDate(l.due_date)} · Returned ${formatDate(l.returned_at!)}.`,
        ]
        if (wasLateReturn) {
          reasonLines.push("Returned after the due date — an overdue fine applies (computed against the library calendar).")
        }
        reasonLines.push(
          `Condition declared at borrow: ${BORROW_CONDITION_LABEL[l.condition_at_borrow] ?? l.condition_at_borrow}` +
            (l.condition_at_return
              ? ` · Found at return: ${RETURN_CONDITION_LABEL[l.condition_at_return] ?? l.condition_at_return}.`
              : ".")
        )
        if (isNewDamage) {
          reasonLines.push("Damage found at return wasn't declared at borrow — a damage/replacement fee applies.")
        }
        reasonLines.push(
          paid && l.receipt_number
            ? `Settled — receipt ${l.receipt_number}.`
            : "Not yet settled — payable in person at the circulation desk."
        )

        entries.push({
          loanId: l.id,
          title,
          amount: l.fine_amount!,
          kind: paid ? "paid" : "unsettled",
          detail:
            paid && l.receipt_number
              ? `Returned ${formatDate(l.returned_at!)} · Receipt ${l.receipt_number}`
              : `Returned ${formatDate(l.returned_at!)}`,
          reasonLines,
        })
      } else if ((l.status === "active" || l.status === "overdue") && (l.preview_fine_amount ?? 0) > 0) {
        const days = l.days_overdue ?? 0
        entries.push({
          loanId: l.id,
          title,
          amount: l.preview_fine_amount!,
          kind: "accruing",
          detail: `${days} day${days === 1 ? "" : "s"} overdue · not yet returned`,
          reasonLines: [
            `Due ${formatDate(l.due_date)} — ${days} day${days === 1 ? "" : "s"} overdue as of today.`,
            "This is a preview only and increases daily (per the library calendar) until the book is returned.",
          ],
        })
      }
    }
    return entries
  }, [loans])

  const outstandingFines = useMemo(
    () => fineEntries.filter((e) => e.kind !== "paid").reduce((sum, e) => sum + e.amount, 0),
    [fineEntries]
  )

  // Patched locally from the settle-fine response's own inputs rather than
  // its response body — the endpoint doesn't return days_overdue/
  // preview_fine_amount (GET /loans-only computed fields), so merging its
  // full response back in would blank those out on the still-open modal.
  function handleFineSettled(loanId: string, receiptNumber: string) {
    setLoans((prev) => prev.map((l) => (l.id === loanId ? { ...l, fine_status: "paid", receipt_number: receiptNumber } : l)))
  }

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

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number; warn?: boolean }[] = [
    { key: "loans",        label: "Active Loans",  icon: <BookOpen size={14} />, count: activeLoans.length },
    { key: "reservations", label: "Reservations",  icon: <Bookmark size={14} />, count: reservations.length },
    { key: "history",      label: "History",       icon: <History size={14} />,  count: returnedLoans.length },
    { key: "fines",        label: "Fines",         icon: <span className="leading-none font-bold" style={{ fontSize: "14px" }}>₱</span>, count: fineEntries.length, warn: outstandingFines > 0 },
  ]

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-6xl h-[92vh] sm:h-[86vh] max-h-[940px] bg-white rounded-t-(--radius-lg) sm:rounded-(--radius-lg) shadow-(--shadow-lg) flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-ink-100 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div
              className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0 w-12 h-12 sm:w-[60px] sm:h-[60px]"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p
                className="text-ink-400 uppercase font-semibold"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}
              >
                Patron Record
              </p>
              <h2
                className="text-ink-900 font-semibold truncate"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}
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
                  tab === t.key
                    ? "bg-green-100 text-green-800"
                    : t.warn
                      ? "bg-danger-bg text-danger"
                      : "bg-ink-100 text-ink-500"
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
              {tab === "fines" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-sm border border-ink-200 bg-ink-50">
                    <div>
                      <p
                        className="text-ink-400 uppercase font-semibold"
                        style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}
                      >
                        Outstanding
                      </p>
                      <p
                        className={cn("font-semibold", outstandingFines > 0 ? "text-danger" : "text-ink-900")}
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xl)" }}
                      >
                        ₱{outstandingFines.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-ink-500 max-w-sm" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                      Fines are settled in person at the circulation desk — a librarian records the receipt number
                      when the book is returned, under <span className="font-medium text-ink-700">Borrow &amp; Return</span>.
                    </p>
                  </div>
                  <FinesList entries={fineEntries} onSettled={handleFineSettled} />
                </div>
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

function FinesList({
  entries,
  onSettled,
}: {
  entries: FineEntry[]
  onSettled: (loanId: string, receiptNumber: string) => void
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-ink-300">
        <span className="leading-none font-bold" style={{ fontSize: "26px" }}>₱</span>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No fines on record.</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((e) => (
        <FineRow key={e.loanId} entry={e} onSettled={onSettled} />
      ))}
    </ul>
  )
}

// Librarian-side "we already collected this in person" record-keeping —
// not a payment gateway. Only unsettled entries get the action; accruing
// fines aren't final until the book is actually returned, and paid ones
// already show their receipt number.
function FineRow({
  entry,
  onSettled,
}: {
  entry: FineEntry
  onSettled: (loanId: string, receiptNumber: string) => void
}) {
  const [settling, setSettling] = useState(false)
  const [receiptNumber, setReceiptNumber] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [showReason, setShowReason] = useState(false)

  async function handleConfirm() {
    const trimmed = receiptNumber.trim()
    if (!trimmed) {
      setError("A receipt number is required")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      await settleFine(entry.loanId, trimmed)
      onSettled(entry.loanId, trimmed)
      setSettling(false)
      setReceiptNumber("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 rounded-sm border border-ink-200 bg-white">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {entry.title}
          </p>
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            {entry.detail}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            ₱{entry.amount.toFixed(2)}
          </span>
          <span
            className={cn("px-2.5 py-1 rounded-sm border font-semibold", FINE_CFG[entry.kind].bg, FINE_CFG[entry.kind].text, FINE_CFG[entry.kind].border)}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {FINE_CFG[entry.kind].label}
          </span>
          <button
            type="button"
            onClick={() => setShowReason((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-sm text-ink-500 hover:text-ink-800 hover:bg-ink-50 font-medium transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            Why this amount?
            {showReason ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {entry.kind === "unsettled" && !settling && (
            <button
              type="button"
              onClick={() => setSettling(true)}
              className="px-2.5 py-1 rounded-sm border border-ink-300 text-ink-700 hover:bg-ink-50 font-medium transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              Record Payment
            </button>
          )}
        </div>
      </div>

      {showReason && (
        <ul className="flex flex-col gap-1 mt-1 pt-2 pl-3 border-t border-l-2 border-ink-200">
          {entry.reasonLines.map((line, i) => (
            <li key={i} className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              {line}
            </li>
          ))}
        </ul>
      )}

      {settling && (
        <div className="flex items-center gap-2 pt-2 border-t border-ink-100">
          <input
            type="text"
            placeholder="Receipt number, e.g. OR-2026-0001"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autoFocus
            className="flex-1 px-2.5 py-1.5 rounded-sm border border-ink-200 focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !receiptNumber.trim()}
            className="px-3 py-1.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            {submitting ? "Saving…" : "Confirm Paid"}
          </button>
          <button
            type="button"
            onClick={() => { setSettling(false); setError(""); setReceiptNumber("") }}
            className="px-2.5 py-1.5 text-ink-500 hover:text-ink-700 font-medium transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          {error}
        </p>
      )}
    </li>
  )
}

function ActivityList({
  items,
  empty,
}: {
  items: { key: string; title: string; line1: string; line2?: string; cfg: { label: string; text: string; bg: string; border: string } }[]
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
          className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-sm border border-ink-200 bg-white"
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
            className={cn("shrink-0 px-2.5 py-1 rounded-sm border font-semibold", item.cfg.bg, item.cfg.text, item.cfg.border)}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {item.cfg.label}
          </span>
        </li>
      ))}
    </ul>
  )
}