// A patron's profile: details on the left, and tabs for loans,
// reservations, history and fines.

"use client"

import { useRef, useEffect, useMemo, useState } from "react"
import { X, BookOpen, Bookmark, History, Mail, UserX, UserCheck, ChevronDown, ChevronUp, Info } from "lucide-react"
import { cn, ordinal } from "@/lib/utils"
import type { UserProfile, Reservation, ReservationStatus } from "@lasallia/types"
import { fetchLoans, settleFine, type Loan } from "@/lib/kiosk"
import { fetchReservations } from "@/lib/reservations"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { RoleBadge } from "./RoleBadge"
import { AccountStatusPill } from "./AccountStatusPill"
import { BookCover } from "@/components/ui/catalog/BookCover"
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'

type Tab = "loans" | "reservations" | "history" | "fines"

type PatronProfileModalProps = {
  patron: UserProfile
  onClose: () => void
  onToggleStatus: () => void
  // The librarian's own profile: Deactivate is disabled (the API blocks it too).
  isSelf?: boolean
}

const DUE_SOON_DAYS = 3

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

// Loan status tags.
const LOAN_CFG = {
  active:   { label: "Active",   text: "text-success", bg: "bg-success-bg", border: "border-success/30" },
  due_soon: { label: "Due Soon", text: "text-warn",    bg: "bg-warn-bg",    border: "border-warn/30" },
  overdue:  { label: "Overdue",  text: "text-danger",  bg: "bg-danger-bg",  border: "border-danger/30" },
}

// Reservation status tags, same as the Reservations page.
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

// unsettled: returned, fine not paid yet.
// accruing: still out and overdue; the amount is what it would be today.
const FINE_CFG: Record<FineKind, { label: string; text: string; bg: string; border: string }> = {
  unsettled: { label: "Unsettled", text: "text-danger",  bg: "bg-danger-bg",  border: "border-danger/30" },
  accruing:  { label: "Accruing",  text: "text-warn",    bg: "bg-warn-bg",    border: "border-warn/30" },
  paid:      { label: "Paid",      text: "text-success", bg: "bg-success-bg", border: "border-success/30" },
}

// Readable names for the stored condition values.
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
  /** "Why this amount?" rows, using only what's recorded on the loan. */
  reasons: FineReason[]
}

type FineReason = { label: string; value: string; tone?: "danger" | "success" }

function dayCount(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`
}

export function PatronProfileModal({ patron, onClose, onToggleStatus, isSelf = false }: PatronProfileModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(dialogRef, { onClose })

  const [tab, setTab] = useState<Tab>("loans")
  const isActive = patron.status !== "inactive"
  const blockSelfDeactivate = isActive && isSelf

  const [loans, setLoans] = useState<Loan[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  // Set after loading, since Date.now() can't be called during render.
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

        // Calendar days, for context only — the fine itself is counted on
        // library days, so the two can differ around weekends/holidays.
        const daysAfterDue = Math.max(
          0,
          Math.round((new Date(l.returned_at!).getTime() - new Date(l.due_date).getTime()) / 86_400_000)
        )
        const borrowCondition = BORROW_CONDITION_LABEL[l.condition_at_borrow] ?? l.condition_at_borrow
        const returnCondition = l.condition_at_return
          ? RETURN_CONDITION_LABEL[l.condition_at_return] ?? l.condition_at_return
          : null

        // The recorded split when the loan has it; otherwise just the reason.
        const overdueAmt = l.overdue_fine_amount
        const damageAmt = l.damage_fine_amount
        const charges: string[] = []
        if (overdueAmt != null && damageAmt != null) {
          if (overdueAmt > 0) charges.push(`Late return ₱${overdueAmt.toFixed(2)}`)
          if (damageAmt > 0) charges.push(`damage ₱${damageAmt.toFixed(2)}`)
        } else {
          if (wasLateReturn) charges.push("Late return")
          if (isNewDamage) charges.push("damage not declared when borrowed")
        }
        const chargedFor = charges.length > 0
          ? charges.join(" + ").replace(/^./, (c) => c.toUpperCase())
          : "Fine recorded at return"

        const reasons: FineReason[] = [
          { label: "Borrowed", value: formatDate(l.borrowed_at) },
          { label: "Due", value: formatDate(l.due_date) },
          {
            label: "Returned",
            value: wasLateReturn && daysAfterDue > 0
              ? `${formatDate(l.returned_at!)} - ${dayCount(daysAfterDue)} after the due date`
              : formatDate(l.returned_at!),
          },
          {
            label: "Condition",
            value: returnCondition
              ? `${borrowCondition} when borrowed, ${returnCondition} when returned`
              : `${borrowCondition} when borrowed`,
          },
          {
            label: "Charged for",
            value: wasLateReturn && overdueAmt == null ? `${chargedFor} (counted on library days)` : chargedFor,
          },
          paid
            ? { label: "Payment", value: l.receipt_number ? `Paid - receipt ${l.receipt_number}` : "Paid", tone: "success" }
            : { label: "Payment", value: "Not paid yet - pay in person at the circulation desk", tone: "danger" },
        ]

        entries.push({
          loanId: l.id,
          title,
          amount: l.fine_amount!,
          kind: paid ? "paid" : "unsettled",
          detail:
            paid && l.receipt_number
              ? `Returned ${formatDate(l.returned_at!)} · Receipt ${l.receipt_number}`
              : `Returned ${formatDate(l.returned_at!)}`,
          reasons,
        })
      } else if ((l.status === "active" || l.status === "overdue") && (l.preview_fine_amount ?? 0) > 0) {
        const days = l.days_overdue ?? 0
        entries.push({
          loanId: l.id,
          title,
          amount: l.preview_fine_amount!,
          kind: "accruing",
          detail: `${days} day${days === 1 ? "" : "s"} overdue · not yet returned`,
          reasons: [
            { label: "Borrowed", value: formatDate(l.borrowed_at) },
            { label: "Due", value: formatDate(l.due_date) },
            { label: "Overdue", value: `${dayCount(days)} as of today`, tone: "danger" },
            { label: "Amount", value: "Estimate - grows each library day until the book is returned" },
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
  // Still growing (books not returned) and already paid.
  const accruingFines = fineEntries.filter((e) => e.kind === "accruing").reduce((sum, e) => sum + e.amount, 0)
  const paidFines = fineEntries.filter((e) => e.kind === "paid").reduce((sum, e) => sum + e.amount, 0)

  // Update the loan locally; the response lacks some computed fields.
  function handleFineSettled(loanId: string, receiptNumber: string) {
    setLoans((prev) => prev.map((l) => (l.id === loanId ? { ...l, fine_status: "paid", receipt_number: receiptNumber } : l)))
  }

  // Some patrons have no name; initials then come from the email.
  const displayName = patron.full_name || "No name on file"
  const initials = (patron.full_name || patron.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  // College: patron.college if set, else guessed from the program. Year
  // level is for students only.
  const isStudent = patron.role === "student"
  const resolvedCollege = patron.college || collegeForProgram(patron.program)
  // ID number applies to every role, so it goes first.
  const idNumberField = patron.id_number
    ? [{ label: isStudent ? "Student No." : "Faculty No.", value: patron.id_number }]
    : []
  const enrollmentFields: { label: string; value: string }[] = isStudent
    ? [
        ...idNumberField,
        patron.program && { label: "Program", value: patron.program },
        resolvedCollege && { label: "College", value: resolvedCollege },
        patron.year_level != null && { label: "Year Level", value: `${ordinal(patron.year_level)} Year` },
      ].filter((f): f is { label: string; value: string } => !!f)
    : [
        ...idNumberField,
        ...(resolvedCollege ? [{ label: "College", value: resolvedCollege }] : []),
      ]

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number; warn?: boolean }[] = [
    { key: "loans",        label: "Active Loans",  icon: <BookOpen size={14} />, count: activeLoans.length },
    { key: "reservations", label: "Reservations",  icon: <Bookmark size={14} />, count: reservations.length },
    { key: "history",      label: "History",       icon: <History size={14} />,  count: returnedLoans.length },
    { key: "fines",        label: "Fines",         icon: <span className="leading-none font-bold" style={{ fontSize: "14px" }}>₱</span>, count: fineEntries.length, warn: outstandingFines > 0 },
  ]

  // At-a-glance figures for the sidebar — the same numbers the tabs list.
  const overdueCount = activeLoans.filter(
    (l) => l.status === "overdue" || (now !== null && new Date(l.due_date).getTime() < now)
  ).length
  const quickStats: { label: string; value: string; alert?: boolean }[] = [
    { label: "Books out", value: String(activeLoans.length) },
    { label: "Overdue", value: String(overdueCount), alert: overdueCount > 0 },
    { label: "Fines owed", value: `₱${outstandingFines.toFixed(2)}`, alert: outstandingFines > 0 },
    { label: "Returned", value: String(returnedLoans.length) },
  ]

  // Two columns: who the patron is (sidebar) and what they have (tabs).
  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Patron record: ${displayName}`}
        className="relative w-full sm:max-w-6xl h-[92vh] sm:h-[82vh] max-h-[780px] bg-white rounded-t-(--radius-lg) sm:rounded-(--radius-lg) shadow-(--shadow-lg) flex flex-col md:flex-row overflow-hidden"
      >

        {/* ── Sidebar: identity, figures, details, account action ── */}
        <aside className="shrink-0 md:w-[360px] max-h-[45%] md:max-h-none bg-ink-50 border-b md:border-b-0 md:border-r border-ink-100 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Avatar beside the name, to keep the header short. */}
          <div className="px-5 md:px-6 pt-5 md:pt-6 pb-4 flex items-center gap-3.5">
            <div
              className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0 w-14 h-14"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-ink-400 uppercase font-semibold"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}
              >
                Patron Record
              </p>
              <h2
                className="text-ink-900 font-semibold leading-snug break-words"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}
              >
                {displayName}
              </h2>
              <p
                className="flex items-start gap-1.5 text-ink-500 mt-0.5 min-w-0"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
              >
                <Mail size={13} className="shrink-0 mt-[3px]" />
                <span className="break-all">{patron.email}</span>
              </p>
            </div>
          </div>
          <div className="px-5 md:px-6 pb-4 flex flex-wrap items-center gap-2">
            <RoleBadge role={patron.role} />
            <AccountStatusPill status={patron.status ?? "active"} />
          </div>

          {/* Figures */}
          <div className="grid grid-cols-4 md:grid-cols-2 gap-2 px-5 md:px-6">
            {quickStats.map((st) => (
              <div key={st.label} className="rounded-sm border border-ink-200 bg-white px-3 py-2 min-w-0 flex flex-col">
                <p
                  className={cn("font-semibold leading-tight truncate", st.alert ? "text-danger" : "text-ink-900")}
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-base)" }}
                >
                  {loadingActivity ? "—" : st.value}
                </p>
                <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                  {st.label}
                </p>
              </div>
            ))}
          </div>

          {/* Details */}
          {enrollmentFields.length > 0 && (
            <dl className="px-5 md:px-6 pt-3 pb-4 grid grid-cols-2 md:grid-cols-1 gap-x-4">
              {enrollmentFields.map((f) => (
                <div key={f.label} className="flex flex-col md:flex-row md:items-center md:justify-between gap-0.5 md:gap-3 py-2 border-b border-ink-100 last:border-b-0">
                  <dt
                    className="text-ink-400 uppercase font-semibold shrink-0"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
                  >
                    {f.label}
                  </dt>
                  <dd
                    className="text-ink-900 font-medium md:text-right min-w-0 break-words"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          </div>

          {/* Account action, always visible at the bottom. */}
          <div className="shrink-0 px-5 md:px-6 py-4 border-t border-ink-100 flex flex-col gap-2">
            {blockSelfDeactivate && (
              <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                You can&apos;t deactivate your own account.
              </p>
            )}
            <button
              type="button"
              onClick={onToggleStatus}
              disabled={blockSelfDeactivate}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-sm transition-colors font-semibold disabled:opacity-50 disabled:pointer-events-none",
                isActive ? "bg-white border border-danger/30 text-danger hover:bg-danger-bg" : "bg-green-700 text-white hover:bg-green-800"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {isActive ? <UserX size={14} /> : <UserCheck size={14} />}
              {isActive ? "Deactivate account" : "Activate account"}
            </button>
          </div>
        </aside>

        {/* ── Main: tabs and their lists ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Tab switcher. Scrolls on narrow screens instead of squashing labels. */}
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-ink-100 shrink-0">
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div role="tablist" aria-label="Patron activity" className="flex w-full min-w-max items-center gap-1 p-1 rounded-full bg-ink-100">
                {tabs.map((t) => {
                  const selected = tab === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full whitespace-nowrap transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700",
                        selected
                          ? "bg-white text-ink-900 font-semibold shadow-(--shadow-sm)"
                          : "text-ink-500 hover:text-ink-800"
                      )}
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                    >
                      <span className={cn("flex", selected ? "text-green-700" : "text-ink-400")}>{t.icon}</span>
                      {t.label}
                      <span
                        className={cn(
                          "flex items-center justify-center rounded-full min-w-[18px] h-[18px] px-1 font-semibold",
                          selected
                            ? "bg-green-100 text-green-800"
                            : t.warn
                              ? "bg-danger-bg text-danger"
                              : "bg-white/70 text-ink-500"
                        )}
                        style={{ fontSize: "var(--text-2xs)" }}
                      >
                        {t.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-9 h-9 rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors shrink-0"
            >
              <X size={17} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
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
                      book: l.books,
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
                    book: r.books,
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
                      book: l.books,
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
                  {/* Three totals, then a note on how fines are paid. */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { label: "Outstanding", value: outstandingFines, tone: outstandingFines > 0 ? "text-danger" : "text-ink-900" },
                      { label: "Accruing", value: accruingFines, tone: accruingFines > 0 ? "text-warn" : "text-ink-900" },
                      { label: "Paid", value: paidFines, tone: paidFines > 0 ? "text-success" : "text-ink-900" },
                    ].map((f) => (
                      <div key={f.label} className="rounded-(--radius) border border-ink-200 bg-white px-4 py-2.5 min-w-0">
                        <p
                          className="text-ink-400 uppercase font-semibold truncate"
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}
                        >
                          {f.label}
                        </p>
                        <p
                          className={cn("font-semibold leading-tight mt-0.5 truncate", f.tone)}
                          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}
                        >
                          ₱{f.value.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p
                    className="flex items-start gap-2 text-ink-500 px-1"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                  >
                    <Info size={13} className="shrink-0 mt-0.5 text-ink-400" />
                    <span>
                      Fines are paid in person at the circulation desk. Record the receipt number with{" "}
                      <span className="font-semibold text-ink-700">Record Payment</span> on the fine below, or when the book is returned in{" "}
                      <span className="font-semibold text-ink-700">Borrow &amp; Return</span>.
                    </span>
                  </p>
                  <FinesList entries={fineEntries} onSettled={handleFineSettled} />
                </div>
              )}
            </>
          )}
          </div>
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
      <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300">
        <span className="leading-none font-bold" style={{ fontSize: "26px" }}>₱</span>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>No fines on record.</p>
      </div>
    )
  }

  return (
    <ul className="rounded-(--radius) border border-ink-200 bg-white divide-y divide-ink-100 overflow-hidden">
      {entries.map((e) => (
        <FineRow key={e.loanId} entry={e} onSettled={onSettled} />
      ))}
    </ul>
  )
}

// A fine row. Unpaid fines can be marked paid at the desk (records the
// receipt, takes no payment).
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
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {entry.title}
          </p>
          <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
            {entry.detail}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            ₱{entry.amount.toFixed(2)}
          </span>
          <span
            className={cn("px-2.5 py-0.5 rounded-full font-semibold", FINE_CFG[entry.kind].bg, FINE_CFG[entry.kind].text)}
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
        <dl className="mt-1 rounded-sm bg-ink-50 px-3.5 py-2.5 grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          {entry.reasons.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                {r.label}
              </dt>
              <dd
                className={cn(
                  "min-w-0",
                  r.tone === "danger" ? "text-danger font-medium" : r.tone === "success" ? "text-success font-medium" : "text-ink-700"
                )}
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
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

type ActivityItem = {
  key: string
  book?: { cover_url?: string | null; cover_color?: string | null } | null
  title: string
  line1: string
  line2?: string
  cfg: { label: string; text: string; bg: string; border: string }
}

// A list of loans or reservations with a small cover and status pill.
function ActivityList({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300">
        <BookOpen size={26} />
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>{empty}</p>
      </div>
    )
  }

  return (
    <ul className="rounded-(--radius) border border-ink-200 bg-white divide-y divide-ink-100 overflow-hidden">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3.5 px-4 py-3">
          <div
            className="w-9 h-[52px] rounded-[3px] overflow-hidden shrink-0 shadow-(--shadow-sm)"
            style={{ background: item.book?.cover_color ?? "var(--color-green-800)" }}
          >
            <BookCover
              src={item.book?.cover_url}
              alt=""
              className="w-full h-full object-cover"
              fallback={
                <div className="w-full h-full flex items-center justify-center text-white/60">
                  <BookOpen size={14} />
                </div>
              }
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-ink-900 font-semibold truncate"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              title={item.title}
            >
              {item.title}
            </p>
            <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
              {item.line1}
              {item.line2 && <><span className="text-ink-300 mx-1.5">·</span>{item.line2}</>}
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
