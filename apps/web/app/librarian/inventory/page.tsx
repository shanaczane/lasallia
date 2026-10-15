// apps/web/app/librarian/inventory/page.tsx
// Inventory module (docs/lasallia-inventory-build-plan.md) — every copy in
// the collection with its status, pick an aisle or a whole floor and start
// a shelf check, see past checks, and follow up
// on every copy currently flagged missing or misplaced or reported by a
// student as not on its shelf.

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, BookCheck, ChevronRight, ClipboardCheck, Flag, Loader2, MapPinOff, ScanLine, SearchX } from "lucide-react"
import { cn } from "@/lib/utils"
import { copyStatusConfig } from "@/lib/copyStatus"
import { Pagination } from "@/components/ui/catalog"
import { AllCopiesList } from "@/components/ui/inventory/AllCopiesList"
import {
  fetchFlaggedCopies,
  fetchInventoryCopies,
  fetchInventoryLocations,
  fetchInventorySessions,
  fetchShelfReports,
  formatWhen,
  resolveShelfReport,
  startInventorySession,
  type FlaggedCopy,
  type InventoryCopy,
  type InventoryLocation,
  type InventorySession,
  type InventorySessionStatus,
  type ShelfReport,
} from "@/lib/inventory"

const body = (size = "var(--text-sm-body)") => ({ fontFamily: "var(--font-body)", fontSize: size })

// Both lists page at this size, same idea as My Requests.
const PAGE_SIZE = 5

// Same chevron-as-background-image the other selects on the site use.
const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

// "Showing 1–5 of 12" plus the page buttons, as on the Patrons page. Renders
// nothing when everything fits on one page.
function ListPager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  if (totalPages <= 1) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)
  return (
    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
      <p className="text-ink-400" style={body("var(--text-sm)")}>
        Showing <span className="font-medium text-ink-600">{start}–{end}</span> of{" "}
        <span className="font-medium text-ink-600">{total}</span>
      </p>
      <Pagination page={page} totalPages={totalPages} onChange={onChange} />
    </div>
  )
}

// A list can shrink under the current page (e.g. a flagged copy gets
// resolved); clamp so it never shows an empty page.
function pageOf<T>(items: T[], page: number): { items: T[]; page: number } {
  const last = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const current = Math.min(page, last)
  return { items: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), page: current }
}

const SESSION_STATUS: Record<InventorySessionStatus, { label: string; style: string }> = {
  in_progress: { label: "In progress", style: "bg-gold-100 text-ink-800" },
  completed:   { label: "Completed",   style: "bg-green-100 text-green-800" },
  cancelled:   { label: "Cancelled",   style: "bg-ink-100 text-ink-600" },
}

// Same look as the librarian dashboard's stat cards. Each links down to the
// list below that its count is taken from.
function FlagCountCard({
  href, icon, iconBg, label, value, sub,
}: {
  href: string
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub: string
}) {
  return (
    <a
      href={href}
      className="min-w-0 bg-white rounded-(--radius) border border-ink-200 p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 hover:border-ink-300 transition-colors"
    >
      <div className={cn("flex items-center justify-center rounded-sm w-7 h-7 sm:w-9 sm:h-9", iconBg)}>
        {icon}
      </div>
      <div>
        <p
          className="text-ink-400 uppercase font-semibold truncate"
          style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}
        >
          {label}
        </p>
        <p className="text-ink-900 font-bold leading-tight" style={{ fontSize: "var(--text-2xl)", fontFamily: "var(--font-display)" }}>
          {value}
        </p>
        <p className="mt-0.5 truncate text-ink-500" style={body("var(--text-xs)")}>
          {sub}
        </p>
      </div>
    </a>
  )
}

function locationKey(l: { floor: string; aisle: string | null }): string {
  return `${l.floor}|${l.aisle ?? ""}`
}

export default function InventoryPage() {
  const router = useRouter()
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [flagged, setFlagged] = useState<FlaggedCopy[]>([])
  const [copies, setCopies] = useState<InventoryCopy[]>([])
  const [reports, setReports] = useState<ShelfReport[]>([])
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [reportError, setReportError] = useState("")
  const [selected, setSelected] = useState("")
  // Smart check: skip copies already seen in the last 6 months.
  const [skipSeen, setSkipSeen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState("")
  const [checksPage, setChecksPage] = useState(1)
  const [flaggedPage, setFlaggedPage] = useState(1)

  useEffect(() => {
    Promise.all([
      fetchInventoryLocations(),
      fetchInventorySessions(),
      fetchFlaggedCopies(),
      fetchInventoryCopies(),
      fetchShelfReports().catch(() => []),
    ])
      .then(([l, s, f, c, r]) => {
        setLocations(l)
        setSessions(s)
        setFlagged(f)
        setCopies(c)
        setReports(r)
        // Default to the first aisle rather than a whole floor — the
        // smaller check is the common one.
        const first = l.find((x) => x.aisle) ?? l[0]
        if (first) setSelected(locationKey(first))
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load inventory"))
      .finally(() => setLoading(false))
  }, [])

  const choice = locations.find((l) => locationKey(l) === selected)
  const missingCount = flagged.filter((c) => c.status === "missing").length
  const misplacedCount = flagged.filter((c) => c.status === "misplaced").length
  const availableCount = copies.filter((c) => c.status === "available").length
  const checks = pageOf(sessions, checksPage)
  const flaggedView = pageOf(flagged, flaggedPage)

  async function handleStart() {
    if (!choice) return
    setStarting(true)
    setStartError("")
    try {
      const session = await startInventorySession(choice.floor, choice.aisle, skipSeen)
      router.push(`/librarian/inventory/${session.id}`)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start the check")
      setStarting(false)
    }
  }

  async function handleResolveReport(report: ShelfReport, action: "on_shelf" | "missing") {
    setResolvingId(report.id)
    setReportError("")
    try {
      await resolveShelfReport(report.id, action)
      setReports((rs) => rs.filter((r) => r.id !== report.id))
      // Marking missing changes copy statuses in both lists below.
      if (action === "missing") {
        const [f, c] = await Promise.all([fetchFlaggedCopies(), fetchInventoryCopies()])
        setFlagged(f)
        setCopies(c)
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Could not update this report")
    } finally {
      setResolvingId(null)
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
          Every book in the collection and where it is. Scan a shelf to see which books are found, misplaced or not found.
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-(--radius) border border-red-200 bg-red-50 px-4 py-3 text-danger" style={body()}>
          <AlertCircle size={16} className="shrink-0" /> {loadError}
        </div>
      )}

      {/* Available / missing / misplaced at a glance — counted from the
          lists below, so they always agree. */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <FlagCountCard
          href="#all-books"
          icon={<BookCheck size={18} className="text-green-700" />}
          iconBg="bg-green-50"
          label="Available"
          value={loading ? "—" : String(availableCount)}
          sub={loading ? "On their shelf" : `On their shelf, of ${copies.length} copies`}
        />
        <FlagCountCard
          href="#flagged"
          icon={<SearchX size={18} className="text-[#6D28D9]" />}
          iconBg="bg-[#EDE9FE]"
          label="Missing"
          value={loading ? "—" : String(missingCount)}
          sub="Copies not found on their shelf"
        />
        <FlagCountCard
          href="#flagged"
          icon={<MapPinOff size={18} className="text-[#9D174D]" />}
          iconBg="bg-[#FCE7F3]"
          label="Misplaced"
          value={loading ? "—" : String(misplacedCount)}
          sub="Copies found on the wrong shelf"
        />
      </div>

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
            className="h-11 flex-1 sm:max-w-md appearance-none pl-3 pr-9 rounded-(--radius) border border-ink-200 bg-white text-ink-800 hover:border-ink-300 focus:outline-none focus:border-green-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              ...body(),
              backgroundImage: `url("${SELECT_CHEVRON}")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
            }}
          >
            {loading && <option>Loading shelves…</option>}
            {locations.map((l) => (
              <option key={locationKey(l)} value={locationKey(l)}>
                {l.label} - {skipSeen
                  ? `${l.unseen_copies} of ${l.expected_copies} to scan`
                  : `${l.expected_copies} ${l.expected_copies === 1 ? "copy" : "copies"}`}
                {l.open_session_id ? " (check in progress)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleStart}
            disabled={!choice || starting}
            className="h-11 flex items-center justify-center gap-2 px-4 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors disabled:opacity-50"
            style={body()}
          >
            {starting ? <Loader2 size={15} className="animate-spin" /> : <ClipboardCheck size={15} />}
            {choice?.open_session_id ? "Join check in progress" : "Start check"}
          </button>
        </div>
        <label className="flex items-start gap-2 cursor-pointer select-none" style={body()}>
          <input
            type="checkbox"
            checked={skipSeen}
            onChange={(e) => setSkipSeen(e.target.checked)}
            className="mt-1 accent-green-700"
          />
          <span>
            <span className="text-ink-900 font-medium">Skip books seen in the last 6 months</span>
            <span className="block text-ink-500" style={body("var(--text-xs)")}>
              Books returned from a loan or found in a check since then are already accounted for, so only the rest need scanning.
            </span>
          </span>
        </label>
        {startError && <p className="text-danger" style={body("var(--text-xs)")}>{startError}</p>}
      </section>

      {/* Students' "Can't find this book on the shelf" reports — the
          librarian checks just that one book. Linked from the notification. */}
      {reports.length > 0 && (
        <section id="reported" className="flex flex-col gap-3 scroll-mt-20">
          <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
            Reported by students
            <span className="text-ink-400 font-normal ml-2" style={body()}>{reports.length}</span>
          </h2>
          {reportError && <p className="text-danger" style={body("var(--text-xs)")}>{reportError}</p>}
          <div className="bg-white rounded-(--radius) border border-ink-200">
            {reports.map((r) => {
              const busy = resolvingId === r.id
              return (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-ink-100 last:border-b-0">
                  <Flag size={16} className="text-warn shrink-0 hidden sm:block" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/librarian/catalog/${r.book_id}`} className="block text-ink-900 font-medium truncate hover:underline" style={body()}>
                      {r.title}
                    </Link>
                    <p className="text-ink-400" style={body("var(--text-xs)")}>
                      {r.call_number && `${r.call_number} · `}should be in {r.location} · {r.reported_by_name ?? "A student"} couldn&apos;t find it, {formatWhen(r.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResolveReport(r, "missing")}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-sm border border-[#DDD6FE] text-[#6D28D9] font-semibold hover:bg-[#EDE9FE] disabled:opacity-50"
                      style={body("var(--text-xs)")}
                    >
                      Not there - mark missing
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveReport(r, "on_shelf")}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 disabled:opacity-50"
                      style={body("var(--text-xs)")}
                    >
                      {busy ? "Saving…" : "It's on the shelf"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <AllCopiesList copies={copies} locations={locations} loading={loading} />

      {/* Past and open checks */}
      <section className="flex flex-col gap-3">
        <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Checks
        </h2>
        <div className="bg-white rounded-(--radius) border border-ink-200 overflow-x-auto">
          {/* Fixed widths so the number columns sit evenly instead of
              bunching up on the right with a wide gap after "Started". */}
          <table className="w-full min-w-160 table-fixed">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
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
              {checks.items.map((s) => {
                const cfg = SESSION_STATUS[s.status]
                return (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/librarian/inventory/${s.id}`)}
                    className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50 cursor-pointer"
                    style={body()}
                  >
                    <td className="px-4 py-3 text-ink-900 font-medium truncate">
                      {s.label}
                      {s.skip_seen_since && <span className="ml-1.5 text-ink-400 font-normal" style={body("var(--text-xs)")}>Smart</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full font-semibold", cfg.style)} style={body("var(--text-2xs)")}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-600 truncate">
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
        <ListPager page={checks.page} total={sessions.length} onChange={setChecksPage} />
      </section>

      {/* Follow-up list — the Missing / Misplaced cards at the top link here. */}
      <section id="flagged" className="flex flex-col gap-3 scroll-mt-20">
        <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          Missing &amp; misplaced copies
          <span className="text-ink-400 font-normal ml-2" style={body()}>{flagged.length}</span>
        </h2>
        <div className="bg-white rounded-(--radius) border border-ink-200">
          {!loading && flagged.length === 0 && (
            <p className="px-4 py-8 text-center text-ink-400" style={body()}>Every copy is where it should be.</p>
          )}
          {flaggedView.items.map((c) => {
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
        <ListPager page={flaggedView.page} total={flagged.length} onChange={setFlaggedPage} />
      </section>
    </div>
  )
}
