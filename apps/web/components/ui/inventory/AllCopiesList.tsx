// Inventory's "All books" list: every copy with its status, location and
// when it was last seen. Filterable and searchable.

"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { COPY_STATUSES, copyStatusConfig, type CopyStatus } from "@/lib/copyStatus"
import { Pagination } from "@/components/ui/catalog"
import type { InventoryCopy, InventoryLocation } from "@/lib/inventory"

const PAGE_SIZE = 10

// Always shown, even at 0.
const KEY_STATUSES: CopyStatus[] = ["available", "missing", "misplaced"]

const body = (size = "var(--text-sm-body)") => ({ fontFamily: "var(--font-body)", fontSize: size })

const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

export function AllCopiesList({
  copies,
  locations,
  loading,
}: {
  copies: InventoryCopy[]
  locations: InventoryLocation[]
  loading: boolean
}) {
  const [status, setStatus] = useState<CopyStatus | "all">("all")
  const [location, setLocation] = useState("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const c: Partial<Record<string, number>> = {}
    for (const copy of copies) c[copy.status] = (c[copy.status] ?? 0) + 1
    return c
  }, [copies])

  const chips = COPY_STATUSES.filter((s) => KEY_STATUSES.includes(s) || counts[s])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return copies.filter((c) => {
      if (status !== "all" && c.status !== status) return false
      if (location !== "all") {
        const [floor, aisle] = location.split("|")
        if (c.floor !== floor || (aisle && c.aisle !== aisle)) return false
      }
      if (!q) return true
      return [c.title, c.author, c.accession_number, c.call_number].some((v) => v?.toLowerCase().includes(q))
    })
  }, [copies, status, location, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  function filterBy<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  return (
    <section id="all-books" className="flex flex-col gap-3 scroll-mt-20">
      <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
        All books
        <span className="text-ink-400 font-normal ml-2" style={body()}>{copies.length} copies</span>
      </h2>

      {/* Status filter — each chip shows how many copies are in that state. */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...chips] as const).map((s) => {
          const active = status === s
          const cfg = s === "all" ? null : copyStatusConfig(s)
          return (
            <button
              key={s}
              type="button"
              onClick={() => filterBy(setStatus)(s)}
              className={cn(
                "px-3 py-1.5 rounded-full border font-medium transition-colors",
                active ? "border-green-700 bg-green-50 text-green-800" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
              )}
              style={body("var(--text-xs)")}
            >
              {cfg ? cfg.label : "All"}{" "}
              <span className={active ? "text-green-700" : "text-ink-400"}>{s === "all" ? copies.length : counts[s] ?? 0}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => filterBy(setQuery)(e.target.value)}
            placeholder="Search title, accession or call number…"
            className="h-10 w-full pl-9 pr-3 rounded-(--radius) border border-ink-200 bg-white focus:outline-none focus:border-green-700"
            style={body()}
          />
        </div>
        <select
          value={location}
          onChange={(e) => filterBy(setLocation)(e.target.value)}
          className="h-10 sm:w-60 appearance-none pl-3 pr-9 rounded-(--radius) border border-ink-200 bg-white text-ink-800 hover:border-ink-300 focus:outline-none focus:border-green-700 cursor-pointer"
          style={{ ...body(), backgroundImage: `url("${SELECT_CHEVRON}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
        >
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={`${l.floor}|${l.aisle ?? ""}`} value={`${l.floor}|${l.aisle ?? ""}`}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-(--radius) border border-ink-200 overflow-x-auto">
        <table className="w-full min-w-180 table-fixed">
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-400 uppercase" style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}>
              <th className="px-4 py-2.5 font-semibold">Accession</th>
              <th className="px-4 py-2.5 font-semibold">Title</th>
              <th className="px-4 py-2.5 font-semibold">Call number</th>
              <th className="px-4 py-2.5 font-semibold">Location</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400" style={body()}>Loading books…</td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400" style={body()}>No copies match these filters.</td></tr>
            )}
            {shown.map((c) => {
              const cfg = copyStatusConfig(c.status)
              return (
                <tr key={c.copy_id} className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50" style={body()}>
                  <td className="px-4 py-3 text-ink-700 truncate" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                    {c.accession_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 min-w-0">
                    <Link href={`/librarian/catalog/${c.book_id}`} className="block text-ink-900 font-medium truncate hover:underline">
                      {c.title}
                    </Link>
                    {c.author && <span className="block text-ink-400 truncate" style={body("var(--text-xs)")}>{c.author}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-600 truncate">{c.call_number ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-600 truncate">{c.location}</td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full font-semibold whitespace-nowrap", cfg.text, cfg.bg)} style={body("var(--text-2xs)")}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-500 truncate" title="Last returned or found in a check">
                    {c.last_seen_at ? formatDay(c.last_seen_at) : <span className="text-ink-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <p className="text-ink-400" style={body("var(--text-sm)")}>
            Showing <span className="font-medium text-ink-600">{(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)}</span> of{" "}
            <span className="font-medium text-ink-600">{filtered.length}</span>
          </p>
          <Pagination page={current} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </section>
  )
}
