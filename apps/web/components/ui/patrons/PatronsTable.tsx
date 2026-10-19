// The patrons table: books out, overdue, fines owed and status first, with
// program and year under the college.

"use client"

import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { collegeForProgram } from "@/lib/collegeForProgram"
import type { UserProfile } from "@lasallia/types"
import { AccountStatusPill } from "./AccountStatusPill"
import { PatronActionsMenu } from "./PatronActionsMenu"

// Per-patron loan figures, worked out by the page from the loans list.
export type PatronStats = {
  booksOut: number
  overdue: number
  // Unpaid plus still-growing fines (same as the profile's "Outstanding").
  owed: number
}

export const EMPTY_STATS: PatronStats = { booksOut: 0, overdue: 0, owed: 0 }

// One column layout for the header and every row, so they line up.
// md: Name | Books out | Overdue | Fines | Status | Actions
// lg: Name | College | Books out | Overdue | Fines | Status | Actions
const ROW_GRID =
  "grid-cols-[minmax(0,2.4fr)_76px_76px_96px_92px_44px] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_76px_76px_96px_92px_44px]"

const body = (size: string) => ({ fontFamily: "var(--font-body)", fontSize: size })

function initialsOf(patron: UserProfile): string {
  return (patron.full_name || patron.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function programLine(patron: UserProfile): string {
  return [patron.program, patron.year_level ? `Year ${patron.year_level}` : null].filter(Boolean).join(" · ")
}

function peso(n: number): string {
  return `₱${n.toFixed(2)}`
}

type PatronsTableProps = {
  patrons: UserProfile[]
  stats: Record<string, PatronStats>
  onView: (patron: UserProfile) => void
  onToggleStatus: (patron: UserProfile) => void
  // Signed-in librarian's id — their own row can't be deactivated.
  selfId?: string | null
}

export function PatronsTable({ patrons, stats, onView, onToggleStatus, selfId }: PatronsTableProps) {
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">

      {/* Desktop/tablet header */}
      <div
        className={cn("hidden md:grid items-center px-4 py-2.5 border-b border-ink-100 text-ink-400 font-semibold uppercase gap-3", ROW_GRID)}
        style={{
          fontSize: "var(--text-2xs)",
          letterSpacing: "var(--tracking-caps)",
          fontFamily: "var(--font-body)",
        }}
      >
        <span>Name</span>
        <span className="hidden lg:block">College</span>
        <span className="text-center">Books out</span>
        <span className="text-center">Overdue</span>
        <span className="text-center">Fines owed</span>
        <span className="text-center">Status</span>
        <span />
      </div>

      {patrons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-ink-300">
          <Users size={28} />
          <p style={body("var(--text-sm-body)")}>
            No users match your search or filters.
          </p>
        </div>
      ) : (
        patrons.map((patron) => {
          // Some patrons have no name: use the email for initials.
          const displayName = patron.full_name || "No name on file"
          const initials = initialsOf(patron)
          const s = stats[patron.id] ?? EMPTY_STATS
          const college = patron.college || collegeForProgram(patron.program)
          const program = programLine(patron)

          return (
            <div key={patron.id} className="border-b border-ink-100 last:border-b-0">

              {/* Desktop/tablet row */}
              <div className={cn("hidden md:grid items-center px-4 py-3 gap-3", ROW_GRID)}>
                <button onClick={() => onView(patron)} className="flex items-center gap-3 min-w-0 group text-left">
                  <div
                    className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0"
                    style={{ width: 36, height: 36, ...body("var(--text-sm-body)") }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-ink-900 font-semibold truncate group-hover:text-green-700 transition-colors"
                      style={body("var(--text-sm-body)")}
                    >
                      {displayName}
                    </p>
                    <p className="text-ink-400 truncate" style={body("var(--text-sm)")}>
                      {patron.email}
                      {patron.id_number ? ` · ${patron.id_number}` : ""}
                    </p>
                  </div>
                </button>

                <div className="hidden lg:block min-w-0">
                  <p className="text-ink-700 truncate" style={body("var(--text-sm-body)")}>{college ?? "—"}</p>
                  {program && (
                    <p className="text-ink-400 truncate" style={body("var(--text-xs)")} title={program}>{program}</p>
                  )}
                </div>

                <span
                  className={cn("text-center", s.booksOut > 0 ? "text-ink-900 font-semibold" : "text-ink-300")}
                  style={body("var(--text-sm-body)")}
                >
                  {s.booksOut}
                </span>

                <span className="flex justify-center">
                  {s.overdue > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-danger-bg text-danger font-semibold" style={body("var(--text-2xs)")}>
                      {s.overdue}
                    </span>
                  ) : (
                    <span className="text-ink-300" style={body("var(--text-sm-body)")}>0</span>
                  )}
                </span>

                <span
                  className={cn("text-center", s.owed > 0 ? "text-danger font-semibold" : "text-ink-300")}
                  style={body("var(--text-sm-body)")}
                >
                  {s.owed > 0 ? peso(s.owed) : "—"}
                </span>

                <span className="flex justify-center">
                  <AccountStatusPill status={patron.status ?? "active"} />
                </span>

                <PatronActionsMenu
                  patron={patron}
                  onView={() => onView(patron)}
                  onToggleStatus={() => onToggleStatus(patron)}
                  isSelf={patron.id === selfId}
                />
              </div>

              {/* Mobile card: overdue and fines as small pills. */}
              <div className="flex md:hidden items-center gap-2.5 px-4 py-3.5">
                <button onClick={() => onView(patron)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                  <div
                    className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold shrink-0"
                    style={{ width: 38, height: 38, ...body("var(--text-sm)") }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-900 font-semibold truncate" style={body("var(--text-sm-body)")}>
                      {displayName}
                    </p>
                    <p className="text-ink-400 truncate" style={body("var(--text-sm)")}>
                      {[college, program].filter(Boolean).join(" · ") || patron.email}
                    </p>
                    {(s.booksOut > 0 || s.overdue > 0 || s.owed > 0 || patron.status === "inactive") && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {s.booksOut > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 font-medium" style={body("var(--text-2xs)")}>
                            {s.booksOut} out
                          </span>
                        )}
                        {s.overdue > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-danger-bg text-danger font-semibold" style={body("var(--text-2xs)")}>
                            {s.overdue} overdue
                          </span>
                        )}
                        {s.owed > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-danger-bg text-danger font-semibold" style={body("var(--text-2xs)")}>
                            {peso(s.owed)} owed
                          </span>
                        )}
                        {patron.status === "inactive" && <AccountStatusPill status="inactive" className="w-auto" />}
                      </div>
                    )}
                  </div>
                </button>
                <PatronActionsMenu
                  patron={patron}
                  onView={() => onView(patron)}
                  onToggleStatus={() => onToggleStatus(patron)}
                  isSelf={patron.id === selfId}
                />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
