// apps/web/components/ui/patrons/PatronProfileModal.tsx
// Sprint 5.5.2 — user profile view modal
// Tabs: Active Loans · Reservations · History

"use client"

import { useState } from "react"
import { X, BookOpen, Bookmark, History, Mail, GraduationCap, UserCog, UserX, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@lasallia/types"
import { getPatronActivity } from "@/lib/mock/patrons"
import { RoleBadge } from "./RoleBadge"
import { AccountStatusPill } from "./AccountStatusPill"

type Tab = "loans" | "reservations" | "history"

type PatronProfileModalProps = {
  patron: UserProfile
  onClose: () => void
  onEditRole: () => void
  onToggleStatus: () => void
}

const LOAN_CFG = {
  active:   { label: "Active",   text: "text-success", bg: "bg-success-bg" },
  due_soon: { label: "Due Soon", text: "text-warn",    bg: "bg-warn-bg" },
  overdue:  { label: "Overdue",  text: "text-danger",  bg: "bg-danger-bg" },
}

const RES_CFG = {
  pending:   { label: "Pending",   text: "text-warn",    bg: "bg-warn-bg" },
  confirmed: { label: "Confirmed", text: "text-info",    bg: "bg-info-bg" },
  cancelled: { label: "Cancelled", text: "text-ink-500", bg: "bg-ink-100" },
  completed: { label: "Completed", text: "text-success", bg: "bg-success-bg" },
}

const HISTORY_CFG = {
  returned:         { label: "Returned",      text: "text-success", bg: "bg-success-bg" },
  overdue_returned: { label: "Returned Late", text: "text-warn",    bg: "bg-warn-bg" },
}

export function PatronProfileModal({ patron, onClose, onEditRole, onToggleStatus }: PatronProfileModalProps) {
  const [tab, setTab] = useState<Tab>("loans")
  const activity = getPatronActivity(patron.id)
  const isActive = patron.status !== "inactive"

  const initials = patron.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "loans",        label: "Active Loans",  icon: <BookOpen size={14} />, count: activity.activeLoans.length },
    { key: "reservations", label: "Reservations",  icon: <Bookmark size={14} />, count: activity.reservations.length },
    { key: "history",      label: "History",       icon: <History size={14} />,  count: activity.history.length },
  ]

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] bg-white rounded-t-(--radius-lg) sm:rounded-(--radius-lg) shadow-(--shadow-lg) flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-ink-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0"
              style={{ width: 44, height: 44, fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h2
                className="text-ink-900 font-semibold truncate"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
              >
                {patron.full_name}
              </h2>
              <div className="flex items-center gap-1.5 text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                <Mail size={12} className="shrink-0" />
                <span className="truncate">{patron.email}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-ink-100 shrink-0">
          <RoleBadge role={patron.role} />
          <AccountStatusPill status={patron.status ?? "active"} />
          {patron.program && (
            <span className="flex items-center gap-1 text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
              <GraduationCap size={13} className="text-ink-400" />
              {patron.program}
              {patron.year_level ? ` · Year ${patron.year_level}` : ""}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex px-5 border-b border-ink-100 shrink-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 border-b-2 transition-colors whitespace-nowrap",
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
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "loans" && (
            <ActivityList
              empty="No active loans."
              items={activity.activeLoans.map((l) => ({
                key: l.bookId + l.borrowedDate,
                title: l.title,
                line1: `Borrowed ${l.borrowedDate}`,
                line2: `Due ${l.dueDate}`,
                cfg: LOAN_CFG[l.status],
              }))}
            />
          )}
          {tab === "reservations" && (
            <ActivityList
              empty="No reservations."
              items={activity.reservations.map((r) => ({
                key: r.bookId + r.requestedDate,
                title: r.title,
                line1: `Requested ${r.requestedDate}`,
                cfg: RES_CFG[r.status],
              }))}
            />
          )}
          {tab === "history" && (
            <ActivityList
              empty="No borrowing history yet."
              items={activity.history.map((h) => ({
                key: h.bookId + h.borrowedDate,
                title: h.title,
                line1: `Borrowed ${h.borrowedDate}`,
                line2: `Returned ${h.returnedDate}`,
                cfg: HISTORY_CFG[h.status],
              }))}
            />
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-ink-100 shrink-0">
          <button
            type="button"
            onClick={onEditRole}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            <UserCog size={14} />
            Edit Role
          </button>
          <button
            type="button"
            onClick={onToggleStatus}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-sm transition-colors font-semibold",
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
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-(--radius) border border-ink-100 bg-ink-50/40"
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