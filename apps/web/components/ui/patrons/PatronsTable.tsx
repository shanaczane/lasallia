// apps/web/components/ui/patrons/PatronsTable.tsx
// Sprint 5.5.1 — users list table with search and filter
// Responsive: grid table on sm+, stacked cards on mobile (matches My Library pattern)

"use client"

import { Users } from "lucide-react"
import type { UserProfile } from "@lasallia/types"
import { RoleBadge } from "./RoleBadge"
import { AccountStatusPill } from "./AccountStatusPill"
import { PatronActionsMenu } from "./PatronActionsMenu"

const GRID_COLS = "2.2fr 1.6fr 0.9fr 0.9fr 0.9fr 44px"

type PatronsTableProps = {
  patrons: UserProfile[]
  onView: (patron: UserProfile) => void
  onToggleStatus: (patron: UserProfile) => void
}

export function PatronsTable({ patrons, onView, onToggleStatus }: PatronsTableProps) {
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">

      {/* Desktop header */}
      <div
        className="hidden md:grid px-4 py-2.5 border-b border-ink-100 text-ink-400 font-semibold uppercase"
        style={{
          gridTemplateColumns: GRID_COLS,
          fontSize: "var(--text-2xs)",
          letterSpacing: "var(--tracking-caps)",
          fontFamily: "var(--font-body)",
        }}
      >
        <span>Name</span>
        <span>Program</span>
        <span>Year Level</span>
        <span className="text-center">Role</span>
        <span className="text-center">Status</span>
        <span />
      </div>

      {patrons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300">
          <Users size={28} />
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            No users match your search or filters.
          </p>
        </div>
      ) : (
        patrons.map((patron) => {
          const initials = patron.full_name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()

          return (
            <div key={patron.id} className="border-b border-ink-100 last:border-b-0">

              {/* Desktop row */}
              <div
                className="hidden md:grid items-center px-4 py-3 gap-3"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <button onClick={() => onView(patron)} className="flex items-center gap-3 min-w-0 group text-left">
                  <div
                    className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0"
                    style={{ width: 36, height: 36, fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-ink-900 font-semibold truncate group-hover:text-green-700 transition-colors"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                    >
                      {patron.full_name}
                    </p>
                    <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                      {patron.email}
                    </p>
                  </div>
                </button>

                <span className="text-ink-600 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                  {patron.program ?? "—"}
                </span>

                <span className="text-ink-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                  {patron.year_level ? `Year ${patron.year_level}` : "—"}
                </span>

                <div className="flex justify-center">
                  <RoleBadge role={patron.role} />
                </div>
                <div className="flex justify-center">
                  <AccountStatusPill status={patron.status ?? "active"} />
                </div>

                <PatronActionsMenu
                  patron={patron}
                  onView={() => onView(patron)}
                  onToggleStatus={() => onToggleStatus(patron)}
                />
              </div>

              {/* Mobile card */}
              <div className="flex md:hidden items-start gap-3 px-4 py-3.5">
                <button onClick={() => onView(patron)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
                  <div
                    className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0"
                    style={{ width: 38, height: 38, fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-900 font-semibold truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      {patron.full_name}
                    </p>
                    <p className="text-ink-400 truncate mb-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
                      {patron.program ?? patron.email}
                      {patron.year_level ? ` · Year ${patron.year_level}` : ""}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RoleBadge role={patron.role} />
                      <AccountStatusPill status={patron.status ?? "active"} />
                    </div>
                  </div>
                </button>
                <PatronActionsMenu
                  patron={patron}
                  onView={() => onView(patron)}
                  onToggleStatus={() => onToggleStatus(patron)}
                />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}