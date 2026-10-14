// apps/web/app/librarian/inventory/page.tsx
// Inventory module (docs/lasallia-inventory-build-plan.md) — pick an aisle
// or a whole floor and start a shelf check, see past checks, and follow up
// on every copy currently flagged missing or misplaced.

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, ChevronRight, ClipboardCheck, Loader2, ScanLine } from "lucide-react"
import { cn } from "@/lib/utils"
import { copyStatusConfig } from "@/lib/copyStatus"
import {
  fetchFlaggedCopies,
  fetchInventoryLocations,
  fetchInventorySessions,
  formatWhen,
  startInventorySession,
  type FlaggedCopy,
  type InventoryLocation,
  type InventorySession,
  type InventorySessionStatus,
} from "@/lib/inventory"

const body = (size = "var(--text-sm-body)") => ({ fontFamily: "var(--font-body)", fontSize: size })

const SESSION_STATUS: Record<InventorySessionStatus, { label: string; style: string }> = {
  in_progress: { label: "In progress", style: "bg-gold-100 text-ink-800" },
  completed:   { label: "Completed",   style: "bg-green-100 text-green-800" },
  cancelled:   { label: "Cancelled",   style: "bg-ink-100 text-ink-600" },
}

function locationKey(l: { floor: string; aisle: string | null }): string {
  return `${l.floor}|${l.aisle ?? ""}`
}

export default function InventoryPage() {
  const router = useRouter()
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [flagged, setFlagged] = useState<FlaggedCopy[]>([])
  const [selected, setSelected] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState("")

  useEffect(() => {
    Promise.all([fetchInventoryLocations(), fetchInventorySessions(), fetchFlaggedCopies()])
      .then(([l, s, f]) => {
        setLocations(l)
        setSessions(s)
        setFlagged(f)
        // Default to the first aisle rather than a whole floor — the
        // smaller check is the common one.
        const first = l.find((x) => x.aisle) ?? l[0]
        if (first) setSelected(locationKey(first))
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load inventory"))
      .finally(() => setLoading(false))
  }, [])

  const choice = locations.find((l) => locationKey(l) === selected)

  async function handleStart() {
    if (!choice) return
    setStarting(true)
    setStartError("")
    try {
      const session = await startInventorySession(choice.floor, choice.aisle)
      router.push(`/librarian/inventory/${session.id}`)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start the check")
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-6">
      <div>
        <h1
          className="text-ink-900 font-semibold leading-tight"
          style={{ fontSize: "var(--text-4xl)", fontFamily: "var(--font-display)" }}
        >
          Inventory
        </h1>
        <p className="text-ink-500 mt-1" style={body()}>
          Scan a shelf to see which books are found, misplaced or not found.
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-(--radius) border border-red-200 bg-red-50 px-4 py-3 text-danger" style={body()}>
          <AlertCircle size={16} className="shrink-0" /> {loadError}
        </div>
      )}

      {/* Start a check */}
      <section className="bg-white rounded-(--radius) border border-ink-200 p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ScanLine size={18} className="text-green-700" />
          <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
            Start a check
          </h2>
        </div>
        <p className="text-ink-500" style={body()}>
          Choose an aisle, or a whole floor. Books on loan or held for a reservation aren&apos;t expected on the shelf.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading || locations.length === 0}
            className="flex-1 sm:max-w-md px-3 py-2.5 rounded-(--radius) border border-ink-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            style={body()}
          >
            {loading && <option>Loading shelves…</option>}
            {locations.map((l) => (
              <option key={locationKey(l)} value={locationKey(l)}>
                {l.label} — {l.expected_copies} {l.expected_copies === 1 ? "copy" : "copies"}
                {l.open_session_id ? " (check in progress)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStart}
            disabled={!choice || starting}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors disabled:opacity-50"
            style={body()}
          >
            {starting ? <Loader2 size={15} className="animate-spin" /> : <ClipboardCheck size={15} />}
            {choice?.open_session_id ? "Join check in progress" : "Start check"}
          </button>
        </div>
        {startError && <p className="text-danger" style={body("var(--text-xs)")}>{startError}</p>}
      </section>

      {/* Past and open checks */}
      <section className="flex flex-col gap-3">
        <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Checks
        </h2>
        <div className="bg-white rounded-(--radius) border border-ink-200 overflow-x-auto">
          <table className="w-full min-w-160">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-400 uppercase" style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}>
                <th className="px-4 py-2.5 font-semibold">Location</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Started</th>
                <th className="px-4 py-2.5 font-semibold text-right">Found</th>
                <th className="px-4 py-2.5 font-semibold text-right">Misplaced</th>
                <th className="px-4 py-2.5 font-semibold text-right">Not found</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-400" style={body()}>
                    No checks yet — start one above.
                  </td>
                </tr>
              )}
              {sessions.map((s) => {
                const cfg = SESSION_STATUS[s.status]
                return (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/librarian/inventory/${s.id}`)}
                    className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50 cursor-pointer"
                    style={body()}
                  >
                    <td className="px-4 py-3 text-ink-900 font-medium">{s.label}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full font-semibold", cfg.style)} style={body("var(--text-2xs)")}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {formatWhen(s.started_at)}
                      {s.started_by_name && <span className="text-ink-400"> · {s.started_by_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-900">{s.found} / {s.expected}</td>
                    <td className="px-4 py-3 text-right text-ink-900">{s.misplaced}</td>
                    <td className="px-4 py-3 text-right text-ink-900">
                      {s.status === "in_progress" ? <span className="text-ink-400">{s.pending} left</span> : s.not_found}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-400"><ChevronRight size={16} className="inline" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Follow-up list — the dashboard's Missing / Misplaced cards link here. */}
      <section id="flagged" className="flex flex-col gap-3 scroll-mt-20">
        <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Missing &amp; misplaced copies
          <span className="text-ink-400 font-normal ml-2" style={body()}>{flagged.length}</span>
        </h2>
        <div className="bg-white rounded-(--radius) border border-ink-200">
          {!loading && flagged.length === 0 && (
            <p className="px-4 py-8 text-center text-ink-400" style={body()}>Every copy is where it should be.</p>
          )}
          {flagged.map((c) => {
            const cfg = copyStatusConfig(c.status)
            return (
              <Link
                key={c.copy_id}
                href={`/librarian/catalog/${c.book_id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-ink-100 last:border-b-0 hover:bg-ink-50"
              >
                <span className={cn("px-2 py-0.5 rounded-full font-semibold shrink-0", cfg.text, cfg.bg)} style={body("var(--text-2xs)")}>
                  {cfg.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink-900 font-medium truncate" style={body()}>{c.title}</span>
                  <span className="block text-ink-400" style={body("var(--text-xs)")}>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{c.accession_number}</span>
                    {c.call_number && ` · ${c.call_number}`} · belongs in {c.location}
                  </span>
                </span>
                <ChevronRight size={16} className="text-ink-400 shrink-0" />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
