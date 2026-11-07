// Everything overdue, most overdue first: who has it, how late it is, the
// fine so far and the reminders sent. Same numbers as the Overdue report.

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BellRing, Check } from "lucide-react"
import { RoleBadge } from "@/components/ui/patrons/RoleBadge"
import { formatDate, formatDateTime } from "@/lib/dueDates"
import { fetchOverdueList, sendOverdueReminder, type OverdueLoan } from "@/lib/overdue"
import {
  matchesOverdueFilters,
  OVERDUE_RANGES,
  REMINDER_KIND_LABEL,
  type OverdueFilters,
  type OverdueRange,
} from "@/lib/overdueFilters"
import { ROLE_LABEL } from "@/lib/roles"

const text = (size: string) => ({ fontFamily: "var(--font-body)", fontSize: `var(${size})` })
const selectClass = "w-full px-3 py-1.5 rounded border border-ink-300 bg-white text-ink-800 focus:outline-none focus:ring-2 focus:ring-green-500"

function FilterSelect({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-40 text-ink-500" style={text("--text-2xs")}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass} style={text("--text-sm-body")}>
        {children}
      </select>
    </label>
  )
}

function LastReminder({ row }: { row: OverdueLoan }) {
  if (!row.lastReminderAt) return <span className="text-ink-400" style={text("--text-xs")}>None yet</span>
  return (
    <span className="flex flex-col text-ink-700" style={text("--text-xs")}>
      <span>{formatDateTime(row.lastReminderAt)}</span>
      <span className="text-ink-400">
        {REMINDER_KIND_LABEL[row.lastReminderKind ?? ""] ?? "Reminder"} · {row.reminderCount} sent
      </span>
    </span>
  )
}

function RemindButton({ row, busy, onSend }: { row: OverdueLoan; busy: boolean; onSend: () => void }) {
  if (row.remindedToday) {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 font-semibold whitespace-nowrap" style={text("--text-xs")}>
        <Check size={13} /> Sent today
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onSend}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-700 text-white font-semibold whitespace-nowrap hover:bg-green-800 transition-colors disabled:opacity-50"
      style={text("--text-xs")}
    >
      <BellRing size={13} /> Send reminder now
    </button>
  )
}

export function OverdueListPanel() {
  const [rows, setRows] = useState<OverdueLoan[] | null>(null)
  const [filters, setFilters] = useState<OverdueFilters>({ userType: "all", collectionType: "all", range: "all" })
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(() => (
    fetchOverdueList()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the overdue list"))
  ), [])

  useEffect(() => { load() }, [load])

  const collections = useMemo(() => [...new Set((rows ?? []).map((r) => r.collectionType))].sort(), [rows])
  const shown = useMemo(() => (rows ?? []).filter((r) => matchesOverdueFilters(r, filters)), [rows, filters])

  async function send(loanId: string) {
    setSendingId(loanId)
    setError("")
    try {
      await sendOverdueReminder(loanId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reminder")
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-4" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect label="User Type" value={filters.userType} onChange={(userType) => setFilters((f) => ({ ...f, userType }))}>
          <option value="all">All User Types</option>
          <option value="student">{ROLE_LABEL.student}</option>
          <option value="faculty">{ROLE_LABEL.faculty}</option>
        </FilterSelect>
        <FilterSelect label="Collection" value={filters.collectionType} onChange={(collectionType) => setFilters((f) => ({ ...f, collectionType }))}>
          <option value="all">All Collections</option>
          {collections.map((c) => <option key={c} value={c}>{c}</option>)}
        </FilterSelect>
        <FilterSelect label="Overdue" value={filters.range} onChange={(range) => setFilters((f) => ({ ...f, range: range as OverdueRange }))}>
          {OVERDUE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </FilterSelect>
      </div>

      {error && <p className="text-red-600" style={text("--text-xs")} role="alert">{error}</p>}

      {rows === null && !error && <p className="text-ink-400" style={text("--text-sm-body")}>Loading…</p>}
      {rows !== null && shown.length === 0 && (
        <p className="text-ink-400 py-8 text-center" style={text("--text-sm-body")}>
          {rows.length === 0 ? "Nothing is overdue." : "Nothing matches these filters."}
        </p>
      )}

      {shown.length > 0 && (
        <>
          {/* Wide screens */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-ink-400 uppercase border-b border-ink-100" style={{ ...text("--text-2xs"), letterSpacing: "var(--tracking-caps)" }}>
                  {["Borrower", "Book", "Due date", "Overdue", "Fine so far", "Last reminder", ""].map((h) => (
                    <th key={h} className="py-2 pr-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100 last:border-b-0 align-top">
                    <td className="py-3 pr-4">
                      <p className="text-ink-900 font-semibold" style={text("--text-sm-body")}>{row.patron}</p>
                      {row.role && <RoleBadge role={row.role} className="mt-1" />}
                    </td>
                    <td className="py-3 pr-4 max-w-64">
                      <p className="text-ink-900" style={text("--text-sm-body")}>{row.book}</p>
                      <p className="text-ink-400" style={text("--text-xs")}>
                        {row.accession ?? "No accession number"} · {row.collectionType}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-ink-700 whitespace-nowrap" style={text("--text-sm-body")}>{formatDate(row.dueDate)}</td>
                    <td className="py-3 pr-4 text-red-700 font-semibold" style={text("--text-sm-body")}>{row.overdueLabel}</td>
                    <td className="py-3 pr-4 text-ink-900 font-semibold whitespace-nowrap" style={text("--text-sm-body")}>₱{row.fine.toFixed(2)}</td>
                    <td className="py-3 pr-4"><LastReminder row={row} /></td>
                    <td className="py-3 text-right">
                      <RemindButton row={row} busy={sendingId !== null} onSend={() => send(row.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones and tablets */}
          <ul className="flex lg:hidden flex-col divide-y divide-ink-100">
            {shown.map((row) => (
              <li key={row.id} className="py-3 flex flex-col gap-1.5">
                <p className="text-ink-900 font-semibold" style={text("--text-sm-body")}>{row.patron}</p>
                {row.role && <RoleBadge role={row.role} className="self-start" />}
                <p className="text-ink-700" style={text("--text-sm-body")}>{row.book}</p>
                <p className="text-ink-400" style={text("--text-xs")}>
                  {row.accession ?? "No accession number"} · {row.collectionType} · Due date: {formatDate(row.dueDate)}
                </p>
                <p className="text-red-700 font-semibold" style={text("--text-sm-body")}>
                  {row.overdueLabel} · ₱{row.fine.toFixed(2)}
                </p>
                <LastReminder row={row} />
                <div><RemindButton row={row} busy={sendingId !== null} onSend={() => send(row.id)} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
