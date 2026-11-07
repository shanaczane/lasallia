// The borrower whose ID was tapped at the desk: books they have out (pick
// one to return it), unpaid fines (record a payment) and books ready to
// pick up.

"use client"

import { dueLabel, formatDate } from "@/lib/dueDates"
import { useState } from "react"
import Link from "next/link"
import { BookOpen, Receipt, PackageCheck, X, IdCard } from "lucide-react"
import { RoleBadge } from "@/components/ui/patrons/RoleBadge"
import { settleFine } from "@/lib/kiosk"
import type { DeskPatron } from "@/lib/desk"

const text = (size: string) => ({ fontFamily: "var(--font-body)", fontSize: `var(${size})` })

export function TappedBorrowerCard({
  patron,
  rfidUid,
  onSelectLoan,
  onChanged,
  onClear,
}: {
  patron: DeskPatron
  rfidUid: string
  onSelectLoan: (accessionNumber: string) => void
  // A payment was recorded; reload the borrower.
  onChanged: () => void
  onClear: () => void
}) {
  const [payingId, setPayingId] = useState<string | null>(null)
  const [receipt, setReceipt] = useState("")
  const [saving, setSaving] = useState(false)
  const [payError, setPayError] = useState("")

  async function recordPayment(loanId: string) {
    if (!receipt.trim()) return
    setSaving(true)
    setPayError("")
    try {
      await settleFine(loanId, receipt.trim(), rfidUid)
      setPayingId(null)
      setReceipt("")
      onChanged()
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not record this payment")
    } finally {
      setSaving(false)
    }
  }

  const fineTotal = patron.unpaid_fines.reduce((sum, l) => sum + (l.fine_amount ?? 0), 0)

  return (
    <div className="rounded border border-green-200 bg-green-50 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white text-green-700 shrink-0">
          <IdCard size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-ink-900 font-semibold truncate" style={text("--text-sm-body")}>
            {patron.full_name ?? "Unknown borrower"}
          </p>
          {patron.role && (
            <RoleBadge
              role={patron.role}
              college={patron.college}
              program={patron.program}
              yearLevel={patron.year_level}
              className="my-0.5"
            />
          )}
          <p className="text-ink-500" style={text("--text-2xs")}>
            ID tapped · {patron.open_loans.length} book{patron.open_loans.length === 1 ? "" : "s"} out
            {fineTotal > 0 && ` · ₱${fineTotal.toFixed(2)} unpaid`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear borrower"
          className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-white text-ink-400 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Books out */}
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-ink-700 font-semibold" style={text("--text-2xs")}>
          <BookOpen size={12} /> Books out — pick one, or scan the book
        </p>
        {patron.open_loans.length === 0 ? (
          <p className="text-ink-400" style={text("--text-2xs")}>Nothing out right now.</p>
        ) : (
          patron.open_loans.map((loan) => (
            <button
              key={loan.id}
              type="button"
              onClick={() => loan.accession_number && onSelectLoan(loan.accession_number)}
              className="flex items-center justify-between gap-2 text-left px-3 py-2 rounded border border-ink-200 bg-white hover:bg-ink-50 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-ink-900 font-medium truncate" style={text("--text-sm-body")}>
                  {loan.books?.title ?? "Unknown title"}
                </span>
                <span className="block text-ink-400" style={text("--text-2xs")}>
                  {loan.accession_number} · {dueLabel(loan.due_date)}
                </span>
              </span>
              {loan.days_overdue > 0 && (
                <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold shrink-0" style={text("--text-2xs")}>
                  {loan.overdue_label}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Unpaid fines */}
      {patron.unpaid_fines.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-ink-700 font-semibold" style={text("--text-2xs")}>
            <Receipt size={12} /> Unpaid fines
          </p>
          {patron.unpaid_fines.map((loan) => (
            <div key={loan.id} className="px-3 py-2 rounded border border-amber-200 bg-white flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-ink-900 truncate" style={text("--text-sm-body")}>
                  {loan.books?.title ?? "A returned book"}
                </span>
                <span className="text-amber-700 font-semibold shrink-0" style={text("--text-sm-body")}>
                  ₱{(loan.fine_amount ?? 0).toFixed(2)}
                </span>
              </div>
              {payingId === loan.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Receipt number, e.g. OR-2026-0001"
                    value={receipt}
                    onChange={(e) => setReceipt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && recordPayment(loan.id)}
                    className="flex-1 min-w-0 px-3 py-1.5 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={text("--text-sm-body")}
                  />
                  <button
                    type="button"
                    onClick={() => recordPayment(loan.id)}
                    disabled={!receipt.trim() || saving}
                    className="px-3 py-1.5 rounded bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50"
                    style={text("--text-2xs")}
                  >
                    {saving ? "Saving…" : "Paid"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setPayingId(loan.id); setReceipt(""); setPayError("") }}
                  className="self-start text-green-700 font-semibold hover:text-green-900"
                  style={text("--text-2xs")}
                >
                  Record payment →
                </button>
              )}
            </div>
          ))}
          {payError && <p className="text-red-600" style={text("--text-2xs")}>{payError}</p>}
        </div>
      )}

      {/* Ready to pick up */}
      {patron.ready_pickups.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-ink-700 font-semibold" style={text("--text-2xs")}>
            <PackageCheck size={12} /> Ready to pick up
          </p>
          {patron.ready_pickups.map((p) => (
            <p key={p.reservation_id} className="text-ink-700" style={text("--text-sm")}>
              {p.title}
              {p.pickup_by && <span className="text-ink-400"> · until {formatDate(p.pickup_by)}</span>}
            </p>
          ))}
          <Link href="/librarian/reservations" className="self-start text-green-700 font-semibold hover:text-green-900" style={text("--text-2xs")}>
            Process the pickup in Reservations →
          </Link>
        </div>
      )}
    </div>
  )
}
