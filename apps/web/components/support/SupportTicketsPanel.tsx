// apps/web/components/support/SupportTicketsPanel.tsx
// Librarian inbox for tickets submitted through the login page's Contact
// Support form (lib/supportTickets.ts). Lives inside Settings (its own
// tab) rather than a standalone page — list + detail/update only, no
// incident/status-page management here, that was explicitly out of scope.

"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import {
  Inbox,
  Search,
  Mail,
  Clock,
  CircleDot,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react"
import { useSupportTickets } from "@/lib/hooks/useSupportTickets"
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock"
import { updateSupportTicket, type SupportTicket, type TicketCategory, type TicketStatus } from "@/lib/supportTickets"
import { resolveDateRange, type DateRangePreset } from "@/lib/reports"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  login: "Login Issue",
  technical: "Technical Bug",
  account: "Account Issue",
  other: "Other",
}

const STATUS_CONFIG: Record<TicketStatus, { label: string; icon: React.ReactNode; badge: string }> = {
  open:        { label: "Open",        icon: <CircleDot size={12} />,     badge: "bg-warn-bg text-warn" },
  in_progress: { label: "In Progress", icon: <Loader2 size={12} />,       badge: "bg-info-bg text-info" },
  resolved:    { label: "Resolved",    icon: <CheckCircle2 size={12} />,  badge: "bg-success-bg text-success" },
}

type TabKey = "all" | TicketStatus

const TABS: { key: TabKey; label: string; showCount: boolean }[] = [
  { key: "all",         label: "All",         showCount: false },
  { key: "open",        label: "Open",        showCount: true },
  { key: "in_progress", label: "In Progress", showCount: true },
  { key: "resolved",    label: "Resolved",    showCount: false },
]

// Same chevron-as-background-image treatment used by every other styled
// <select> on the site (librarian Reservations/Reports, student Requests).
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

const DATE_FILTERS: { key: DateRangePreset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "semester", label: "Semester" },
]

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0", cfg.badge)}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function TicketDetailPanel({
  ticket,
  onClose,
  onUpdated,
}: {
  ticket: SupportTicket
  onClose: () => void
  onUpdated: (t: SupportTicket) => void
}) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [note, setNote] = useState(ticket.resolution_note ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const dirty = status !== ticket.status || note !== (ticket.resolution_note ?? "")

  useBodyScrollLock(true)

  async function handleSave() {
    setSaving(true)
    setError("")
    try {
      const updated = await updateSupportTicket(ticket.id, { status, resolution_note: note })
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this ticket")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-150 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ticket details"
        className="fixed inset-y-0 right-0 z-160 flex flex-col bg-white shadow-(--shadow-lg) w-full sm:max-w-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-200 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-ink-500" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
                {ticket.ticket_number}
              </span>
              <StatusBadge status={ticket.status} />
            </div>
            <p className="text-ink-900 font-semibold leading-snug" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
              {CATEGORY_LABEL[ticket.category]}
            </p>
            <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              {ticket.name} · {ticket.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-500 hover:bg-ink-100 transition-colors shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 bg-ink-50" style={{ overscrollBehavior: "contain" }}>
          <div className="bg-white rounded-(--radius) border border-ink-200 p-3.5">
            <p className="text-ink-500 uppercase font-semibold mb-1.5" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
              Message
            </p>
            <p className="text-ink-700 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              {ticket.message}
            </p>
            <p className="text-ink-400 mt-2.5 flex items-center gap-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              <Clock size={13} />
              Submitted {formatDateTime(ticket.created_at)}
            </p>
          </div>

          <div className="bg-white rounded-(--radius) border border-ink-200 p-3.5 flex flex-col gap-3">
            <p className="text-ink-500 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)", fontFamily: "var(--font-body)" }}>
              Response
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                Status
              </label>
              <div className="flex gap-1.5">
                {(Object.keys(STATUS_CONFIG) as TicketStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex-1 px-2 py-1.5 rounded-sm border font-medium transition-colors",
                      status === s ? "border-green-700 bg-green-50 text-green-800" : "border-ink-200 text-ink-600 hover:border-ink-300"
                    )}
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                Note to submitter
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Visible to the submitter when they track this ticket by number + email…"
                className="w-full px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 resize-none"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>

            {error && (
              <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function SupportTicketsPanel() {
  const { tickets, loading, error, setTickets } = useSupportTickets()
  const [activeTab, setActiveTab] = useState<TabKey>("open")
  const [dateFilter, setDateFilter] = useState<DateRangePreset>("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<SupportTicket | null>(null)

  const inRange = useMemo(() => {
    const { dateFrom, dateTo } = resolveDateRange(dateFilter, "", "")
    return tickets.filter((t) => {
      const created = new Date(t.created_at).getTime()
      if (dateFrom && created < new Date(dateFrom).getTime()) return false
      if (dateTo && created > new Date(dateTo).getTime()) return false
      return true
    })
  }, [tickets, dateFilter])

  const tabCounts: Record<TabKey, number> = useMemo(() => ({
    all: inRange.length,
    open: inRange.filter((t) => t.status === "open").length,
    in_progress: inRange.filter((t) => t.status === "in_progress").length,
    resolved: inRange.filter((t) => t.status === "resolved").length,
  }), [inRange])

  const filtered = useMemo(() => {
    let result = activeTab === "all" ? inRange : inRange.filter((t) => t.status === activeTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.ticket_number.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q) ||
          t.message.toLowerCase().includes(q)
      )
    }
    return result
  }, [inRange, activeTab, search])

  function handleUpdated(updated: SupportTicket) {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    setSelected(updated)
  }

  return (
    <div className="flex flex-col gap-3 -mt-2">
      <div className="flex overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 py-2.5 px-3 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0",
              activeTab === tab.key ? "border-green-700 text-green-700" : "border-transparent text-ink-500 hover:text-ink-900"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {tab.label}
            {tab.showCount && tabCounts[tab.key] > 0 && (
              <span
                className={cn(
                  "flex items-center justify-center rounded-full min-w-4 h-4 px-1 font-semibold shrink-0",
                  activeTab === tab.key ? "bg-green-700 text-white" : "bg-ink-200 text-ink-500"
                )}
                style={{ fontSize: "var(--text-2xs)" }}
              >
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ticket number, name, email, or message…"
            className="w-full pl-9 pr-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateRangePreset)}
          aria-label="Filter by date"
          className="appearance-none bg-white border border-ink-200 text-ink-700 rounded-sm pl-3 pr-7 py-2 focus:outline-none focus:border-green-700 hover:border-ink-300 cursor-pointer transition-colors shrink-0"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm-body)",
            backgroundImage: `url("${SELECT_CHEVRON}")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
          }}
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        {error ? (
          <p className="text-center py-12 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {error}
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center py-16 text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-(--radius) border border-ink-200 flex flex-col items-center justify-center py-16 text-ink-400 gap-2">
            <Inbox size={28} className="opacity-30 mb-1" />
            <p style={{ fontSize: "var(--text-body)", fontFamily: "var(--font-body)" }}>No tickets found</p>
          </div>
        ) : (
          <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
            {filtered.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className={cn(
                  "flex items-center gap-3 w-full text-left px-4 sm:px-5 py-4 transition-colors hover:bg-ink-50",
                  i !== filtered.length - 1 && "border-b border-ink-100"
                )}
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-500" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
                      {t.ticket_number}
                    </span>
                    <p className="text-ink-900 font-semibold leading-snug" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
                      {t.name}
                    </p>
                    <span className="text-ink-400 flex items-center gap-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                      <Mail size={11} />
                      {t.email}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                    <span className="text-ink-500 font-medium">{CATEGORY_LABEL[t.category]}</span>
                    <span className="text-ink-300"> · </span>
                    {t.message}
                  </p>
                  <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                    {formatDateTime(t.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
        Submitted through the login page&apos;s Contact Support form. A submitter tracks progress with their ticket
        number and email — there&apos;s no email notification, so a note here is the only way they&apos;ll see it.
      </p>

      {selected && (
        <TicketDetailPanel
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
