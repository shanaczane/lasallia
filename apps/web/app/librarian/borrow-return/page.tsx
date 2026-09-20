// Sprint 5.4 / 7.1 – Quick Scanner Interface, wired to the real borrow/return API
"use client"

import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import {
  ScanLine,
  CheckCircle2,
  User,
  UserPlus,
  BookOpen,
  MapPin,
  Hash,
  Clock,
  Search,
  RotateCcw,
  AlertCircle,
  PackageCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@lasallia/types"
import { Pagination } from "@/components/ui/catalog"
import { ScannerListener } from "@/components/ui/ScannerListener"
import { searchPatrons } from "@/lib/users"
import {
  openSession,
  createAssistedLoan,
  type StationSession,
  type Condition,
} from "@/lib/kiosk"
import {
  lookupLoanByAccession,
  listActiveLoans,
  searchLoans,
  confirmReturn,
  reshelveCopy,
  fetchReshelvingQueue,
  fetchLoansInRange,
  fetchReshelvedInRange,
  type Loan as ActiveLoan,
  type LoanLookupResult,
  type ReturnCondition,
  type ReshelvingQueueItem,
  type ReshelvedItem,
} from "@/lib/returns"
import {
  fetchInHouseLoans,
  createInHouseLoan,
  returnInHouseLoan,
  type InHouseLoan,
  type VisitorType,
  type Purpose as GuestPurpose,
} from "@/lib/inhouse"

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "borrow" | "return" | "reshelving" | "guest"

const BORROW_CONDITIONS: { value: Condition; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "minor_wear", label: "Minor wear" },
  { value: "already_damaged", label: "Already damaged" },
]

// ─── Assisted borrow (desk-side checkout) ──────────────────────────────────────
// The librarian already has the physical book in hand and taps the
// student's ID at their own reader — an ordinary 'rfid' station_sessions
// row, identical to one the digital kiosk would produce (routers/
// sessions.py doesn't care who operates the reader) — then scans or types
// the accession number of the exact copy. No auto-pick, no separate hold:
// POST /loans/librarian-assisted runs the same eligibility checks and
// writes the same loans/book_copies record self-service borrowing does
// (apps/api's core/loans.py), so the two are indistinguishable afterward.
type IdentifyMode = "tap" | "search"

function AssistedBorrowPanel({ onSettled }: { onSettled: () => void }) {
  const [mode, setMode] = useState<IdentifyMode>("tap")

  const [rfidInput, setRfidInput] = useState("")
  const [tapping, setTapping] = useState(false)
  const [tapError, setTapError] = useState("")

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [searchError, setSearchError] = useState("")

  const [session, setSession] = useState<StationSession | null>(null)

  const [accessionInput, setAccessionInput] = useState("")
  const [condition, setCondition] = useState<Condition | null>(null)
  const [purpose, setPurpose] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [confirmed, setConfirmed] = useState<{ title: string; patron: string } | null>(null)

  const canConfirm = !!session && accessionInput.trim().length > 0 && !!condition && !submitting

  async function handleTap() {
    if (!rfidInput.trim()) return
    setTapping(true)
    setTapError("")
    try {
      const s = await openSession("librarian-desk", { authMethod: "rfid", rfidUid: rfidInput.trim() })
      setSession(s)
    } catch (err) {
      setTapError(err instanceof Error ? err.message : "Could not identify that ID")
    } finally {
      setTapping(false)
      setRfidInput("")
    }
  }

  // Debounced search — fallback for when there's no ID card to tap. No
  // credential from the student at all: the librarian's own JWT (already
  // attached by openSession below) is what authorizes this.
  useEffect(() => {
    if (mode !== "search" || !searchQuery.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      searchPatrons(searchQuery.trim(), "student")
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [mode, searchQuery])

  async function handleSelectStudent(patron: UserProfile) {
    setSelecting(true)
    setSearchError("")
    try {
      const s = await openSession("librarian-desk", { authMethod: "librarian_assisted", studentId: patron.id })
      setSession(s)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Could not open a session for this patron")
    } finally {
      setSelecting(false)
    }
  }

  async function handleConfirm() {
    if (!session || !condition) return
    setSubmitting(true)
    setSubmitError("")
    try {
      const loan = await createAssistedLoan({
        stationSessionId: session.id,
        accessionNumber: accessionInput.trim(),
        condition,
        purpose: purpose || undefined,
        notes: notes || undefined,
      })
      const title = loan.books?.title ?? "Unknown title"
      setConfirmed({ title, patron: session.student_first_name })
      onSettled()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not confirm this loan")
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setSession(null)
    setRfidInput("")
    setTapError("")
    setSearchQuery("")
    setSearchResults([])
    setSearchError("")
    setAccessionInput("")
    setCondition(null)
    setPurpose("")
    setNotes("")
    setSubmitError("")
    setConfirmed(null)
  }

  if (confirmed) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-6 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
          <CheckCircle2 size={26} className="text-green-700" />
        </div>
        <div>
          <p className="text-green-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
            Book Borrowed Successfully
          </p>
          <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <span className="font-medium text-ink-700">{confirmed.title}</span> borrowed by{" "}
            <span className="font-medium text-ink-700">{confirmed.patron}</span>
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-white transition-colors font-medium"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <RotateCcw size={13} />
          Borrow Another
        </button>
      </div>
    )
  }

  return (
    <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2">
        <ScanLine size={15} className="text-green-700" />
        <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Assisted Borrow
        </span>
      </div>
      <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
        Tap the student&apos;s ID, then scan or type the accession number of the book already in hand.
      </p>

      {!session ? (
        <div>
          <div className="flex items-center gap-1 p-1 rounded bg-ink-100 mb-2 w-fit mx-auto">
            {([
              { key: "tap", label: "Tap ID" },
              { key: "search", label: "No ID card?" },
            ] as { key: IdentifyMode; label: string }[]).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "px-3 py-1 rounded font-semibold transition-colors",
                  mode === m.key ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
                )}
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "tap" ? (
            <>
              <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                Tap Student ID <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    placeholder="Tap the RFID reader…"
                    value={rfidInput}
                    onChange={(e) => setRfidInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTap()}
                    autoFocus
                    className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
                  />
                </div>
                <button
                  onClick={handleTap}
                  disabled={!rfidInput.trim() || tapping}
                  className={cn(
                    "px-4 py-2 rounded font-semibold transition-colors",
                    rfidInput.trim() && !tapping ? "bg-green-700 text-white hover:bg-green-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
                  )}
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {tapping ? "Checking…" : "Tap"}
                </button>
              </div>
              {tapError && (
                <p className="text-red-600 mt-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                  {tapError}
                </p>
              )}
            </>
          ) : (
            <>
              <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                Search by name or email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  placeholder="e.g. Maria Santos"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                />
              </div>
              {searchError && (
                <p className="text-red-600 mt-1.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                  {searchError}
                </p>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 rounded border border-ink-200 divide-y divide-ink-100 max-h-48 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectStudent(p)}
                      disabled={selecting}
                      className="w-full text-left px-3 py-2 hover:bg-ink-50 transition-colors disabled:opacity-50 flex flex-col"
                    >
                      <span className="text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                        {p.full_name ?? "Unnamed"}
                      </span>
                      <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                        {p.email} · {p.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <p className="text-ink-400 mt-2" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                  No matches.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="rounded bg-green-50 border border-green-200 px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-ink-900" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              Borrowing for <span className="font-semibold">{session.student_first_name}</span>
            </p>
            <button
              onClick={reset}
              className="text-ink-400 hover:text-ink-700 underline"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              Not them?
            </button>
          </div>

          <div>
            <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
              Accession Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Scan or type — e.g. T45136"
                value={accessionInput}
                onChange={(e) => setAccessionInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canConfirm && handleConfirm()}
                autoFocus
                className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
              />
              {/* Safety net for when focus lands elsewhere (e.g. after
                  clicking a Condition button) — a scan is filled in, not
                  auto-submitted, since Condition still has to be picked. */}
              <ScannerListener onScan={setAccessionInput} />
            </div>
          </div>

          <div>
            <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
              Condition Declared <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {BORROW_CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCondition(c.value)}
                  className={cn(
                    "px-3 py-1.5 rounded border font-medium transition-colors",
                    condition === c.value ? "bg-green-700 border-green-700 text-white" : "bg-white border-ink-300 text-ink-600 hover:border-ink-400"
                  )}
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            placeholder="Purpose (optional)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          />

          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded border border-ink-300 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          />

          {submitError && (
            <p className="text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {submitError}
            </p>
          )}

          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "flex items-center justify-center gap-2 py-2 rounded font-semibold transition-colors",
              canConfirm ? "bg-green-700 text-white hover:bg-green-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            <CheckCircle2 size={15} />
            {submitting ? "Processing…" : "Confirm Borrow"}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Return flow (Phase 4, new loans/book_copies schema) ──────────────────────
// No fake camera here — a plain accession-number input plus a
// title/borrower fallback search is what plan 4.1 actually needs.

type SessionRecord = { title: string; patron: string; time: string; note?: string }

// The librarian's local calendar day, as a [from, to) ISO range — computed
// fresh on every load rather than tracked client-side, so "today" rolls
// over on its own at local midnight instead of needing to be reset.
function todayRangeIso(): { from: string; to: string } {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  return { from: startOfToday.toISOString(), to: startOfTomorrow.toISOString() }
}

function loanToSessionRecord(loan: ActiveLoan, timeField: "borrowed_at" | "returned_at"): SessionRecord {
  const timestamp = timeField === "returned_at" ? loan.returned_at! : loan.borrowed_at
  const fine = loan.fine_amount ?? 0
  return {
    title: loan.books?.title ?? "Unknown title",
    patron: loan.profiles?.full_name ?? "Unknown",
    time: new Date(timestamp).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
    note: fine > 0 ? `₱${fine.toFixed(2)} fine` : undefined,
  }
}

function reshelvedToSessionRecord(item: ReshelvedItem): SessionRecord {
  return {
    title: item.books?.title ?? "Unknown title",
    patron: "—",
    time: new Date(item.reshelved_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

const RETURN_CONDITIONS: { value: ReturnCondition; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "damaged", label: "Damaged" },
  { value: "incomplete", label: "Incomplete" },
]

function ConditionButtons({
  value,
  onChange,
}: {
  value: ReturnCondition | null
  onChange: (c: ReturnCondition) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {RETURN_CONDITIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={cn(
            "px-3 py-1.5 rounded border font-medium transition-colors",
            value === c.value
              ? "bg-green-700 border-green-700 text-white"
              : "bg-white border-ink-300 text-ink-600 hover:border-ink-400"
          )}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

// ─── Book cover thumbnail ───────────────────────────────────────────────────
// 160 of 185 real books have a real cover_url — every book "card" on this
// page (Borrow's scan result, Return's found-loan card, the Reshelving
// queue) was showing just a flat color square with the title's first
// letter instead, completely ignoring it. Same real-cover-with-decorative-
// fallback treatment components/ui/catalog/LibrarianBookCard.tsx already
// uses, so a book reads the same whether you're looking it up in the
// catalog or scanning it at the counter.
const COVER_COLORS = [
  "#1E3A5F", "#5C3D11", "#1B3A2D", "#4A1942",
  "#2C3E50", "#1A1A2E", "#0F4C75", "#154360",
  "#1B2631", "#2E4057", "#3B1F2B", "#1C3144",
]

function hashColor(seed: string): string {
  const idx = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COVER_COLORS[idx % COVER_COLORS.length]
}

function BookCoverThumb({
  title,
  author,
  coverUrl,
  coverColor,
  width,
  height,
}: {
  title: string
  author?: string | null
  coverUrl?: string | null
  coverColor?: string | null
  width: number
  height: number
}) {
  const bg = coverColor || hashColor(title)
  return (
    <div
      className="shrink-0 rounded-[3px] overflow-hidden relative"
      style={{ width, height, background: bg }}
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-1.5">
          <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id={`brt-cover-${title}`} width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#brt-cover-${title})`} />
          </svg>
          {author && (
            <p
              className="text-white/60 uppercase font-semibold z-10 leading-tight line-clamp-1"
              style={{ fontSize: "0.45rem", letterSpacing: "0.06em", fontFamily: "var(--font-body)" }}
            >
              {author}
            </p>
          )}
          <p
            className="text-white font-semibold z-10 leading-snug line-clamp-3"
            style={{ fontSize: "0.55rem", fontFamily: "var(--font-display)" }}
          >
            {title}
          </p>
        </div>
      )}
    </div>
  )
}

function BorrowerAvatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-ink-200 text-ink-600 flex items-center justify-center font-semibold shrink-0">
      {(name ?? "?")[0]?.toUpperCase()}
    </div>
  )
}

function ReturnPanel({
  activeLoans,
  loadingActiveLoans,
  onSettled,
}: {
  activeLoans: ActiveLoan[]
  loadingActiveLoans: boolean
  onSettled: () => void
}) {
  const [accessionInput, setAccessionInput] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<LoanLookupResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loan, setLoan] = useState<LoanLookupResult | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [notFoundMessage, setNotFoundMessage] = useState("")

  const [condition, setCondition] = useState<ReturnCondition | null>(null)
  const [conditionNotes, setConditionNotes] = useState("")
  const [replacementCost, setReplacementCost] = useState("")
  const [settlement, setSettlement] = useState<"paid" | "unsettled" | null>(null)
  const [receiptNumber, setReceiptNumber] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [confirmed, setConfirmed] = useState<{ title: string; patron: string; fine: number; needsReshelving: boolean } | null>(null)

  const isNewDamage = !!loan && loan.condition_at_borrow === "good" && (condition === "damaged" || condition === "incomplete")
  const previewTotal = loan
    ? loan.preview_fine_amount + (isNewDamage ? (parseFloat(replacementCost) || 0) + 50 : 0)
    : 0

  async function handleFind(overrideAccession?: string) {
    const value = (overrideAccession ?? accessionInput).trim()
    if (!value) return
    setAccessionInput(value)
    setLoading(true)
    setNotFound(false)
    try {
      const result = await lookupLoanByAccession(value)
      setLoan(result)
    } catch (err) {
      setNotFoundMessage(err instanceof Error ? err.message : "No active loan found for that copy")
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // Selecting a row from the Active Borrowers list — same verification
  // path as a manual scan (handleFind above), just pre-supplied with the
  // accession number that row's own loan record already carries.
  function selectFromActiveList(activeLoan: ActiveLoan) {
    if (!activeLoan.accession_number) return
    handleFind(activeLoan.accession_number)
  }

  async function handleSearch() {
    if (!searchInput.trim()) return
    setSearching(true)
    try {
      setSearchResults(await searchLoans(searchInput.trim()))
    } finally {
      setSearching(false)
    }
  }

  function reset() {
    setAccessionInput("")
    setSearchInput("")
    setSearchOpen(false)
    setSearchResults([])
    setLoan(null)
    setNotFound(false)
    setNotFoundMessage("")
    setCondition(null)
    setConditionNotes("")
    setReplacementCost("")
    setSettlement(null)
    setReceiptNumber("")
    setSubmitError("")
    setConfirmed(null)
  }

  async function handleConfirm() {
    if (!loan || !condition) return
    setSubmitting(true)
    setSubmitError("")
    try {
      const result = await confirmReturn(loan.id, {
        conditionAtReturn: condition,
        conditionNotes: conditionNotes || undefined,
        replacementCost: isNewDamage && replacementCost ? parseFloat(replacementCost) : undefined,
        fineSettlement: previewTotal > 0 ? settlement ?? undefined : undefined,
        receiptNumber: settlement === "paid" ? receiptNumber : undefined,
      })
      const patron = loan.profiles?.full_name ?? "Unknown"
      const fine = result.fine_amount ?? 0
      setConfirmed({ title: loan.books?.title ?? "Unknown title", patron, fine, needsReshelving: result.needs_reshelving })
      onSettled()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not confirm this return")
    } finally {
      setSubmitting(false)
    }
  }

  const canConfirm =
    !!condition &&
    (condition === "good" || conditionNotes.trim().length > 0) &&
    (previewTotal <= 0 || !!settlement) &&
    (settlement !== "paid" || receiptNumber.trim().length > 0) &&
    !submitting

  if (confirmed) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-6 flex flex-col items-center gap-3 text-center">
        {/* No visible accession field on this screen — without this, a
            scan of the next return would be silently lost until the
            librarian clicks "Scan Another" first. */}
        <ScannerListener onScan={(v) => { reset(); handleFind(v) }} />
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
          <CheckCircle2 size={26} className="text-green-700" />
        </div>
        <div>
          <p className="text-green-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
            Book Returned Successfully
          </p>
          <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <span className="font-medium text-ink-700">{confirmed.title}</span> returned by{" "}
            <span className="font-medium text-ink-700">{confirmed.patron}</span>
          </p>
          {confirmed.fine > 0 && (
            <p className="text-amber-700 font-semibold mt-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              ₱{confirmed.fine.toFixed(2)} fine recorded
            </p>
          )}
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 font-medium",
            confirmed.needsReshelving ? "text-green-700" : "text-ink-500"
          )}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
        >
          <PackageCheck size={13} />
          {confirmed.needsReshelving
            ? "This copy now needs reshelving — it'll show up in the Reshelving tab."
            : "Held for the next reservation — no reshelving needed."}
        </p>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-white transition-colors font-medium"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <RotateCcw size={13} />
          Scan Another
        </button>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-6 flex flex-col items-center gap-3 text-center">
        <ScannerListener onScan={(v) => { reset(); handleFind(v) }} />
        <AlertCircle size={26} className="text-red-600" />
        <p className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
          {notFoundMessage || "No active loan found for that copy"}
        </p>
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          If the label is damaged or unreadable, try searching by title or borrower name below.
        </p>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-white transition-colors font-medium"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <RotateCcw size={13} />
          Try Again
        </button>
      </div>
    )
  }

  if (loan) {
    return (
      <div className="rounded border border-green-200 bg-green-50 p-4 flex flex-col gap-3">
        {/* Book + accession */}
        <div className="flex items-start gap-3">
          <BookCoverThumb
            title={loan.books?.title ?? "?"}
            author={loan.books?.author}
            coverUrl={loan.books?.cover_url}
            coverColor={loan.books?.cover_color}
            width={48}
            height={66}
          />
          <div className="flex-1 min-w-0">
            <p className="text-ink-900 font-semibold leading-snug" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
              {loan.books?.title ?? "Unknown title"}
            </p>
            <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {loan.books?.author}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1 text-ink-500" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                <Hash size={11} /> {loan.accession_number}
              </span>
              {loan.books?.call_number && (
                <span className="flex items-center gap-1 text-ink-500" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                  <MapPin size={11} /> {loan.books.call_number}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Borrower + dates */}
        <div className="rounded bg-white border border-ink-200 px-3 py-2 flex items-center gap-3">
          <BorrowerAvatar name={loan.profiles?.full_name ?? null} avatarUrl={loan.profiles?.avatar_url ?? null} />
          <div className="min-w-0 flex-1">
            <p className="text-ink-900 font-semibold" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
              {loan.profiles?.full_name ?? "Unknown borrower"}
            </p>
            <p className="text-ink-400" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
              Borrowed {formatDate(loan.borrowed_at)} · Due {formatDate(loan.due_date)}
            </p>
          </div>
          {loan.days_overdue > 0 && (
            <span className="px-2 py-1 rounded bg-red-100 text-red-700 font-semibold shrink-0" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
              {loan.days_overdue}d overdue
            </span>
          )}
        </div>

        {/* Declared condition baseline */}
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          Declared at borrow: <span className="font-medium text-ink-700">{loan.condition_at_borrow.replace("_", " ")}</span>
        </p>

        {/* Inspection */}
        <div className="flex flex-col gap-2">
          <label className="text-ink-700 font-medium" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
            Condition on return <span className="text-red-500">*</span>
          </label>
          <ConditionButtons value={condition} onChange={setCondition} />
          {condition && condition !== "good" && (
            <textarea
              placeholder="Describe the condition…"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded border border-ink-300 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            />
          )}
          {condition && condition !== "good" && !conditionNotes.trim() && (
            <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              Required to continue — briefly describe the condition.
            </p>
          )}
          {isNewDamage && (
            <div>
              <label className="text-ink-700" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                Replacement cost (₱, optional — plus ₱50 processing fee)
              </label>
              <input
                type="number"
                min={0}
                value={replacementCost}
                onChange={(e) => setReplacementCost(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded border border-ink-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
          )}
        </div>

        {/* Settlement */}
        {previewTotal > 0 && (
          <div className="rounded bg-amber-50 border border-amber-200 p-3 flex flex-col gap-2">
            <p className="text-amber-800 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              ₱{previewTotal.toFixed(2)} fine
            </p>
            <div className="flex gap-1.5">
              {(["paid", "unsettled"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSettlement(s)}
                  className={cn(
                    "px-3 py-1.5 rounded border font-medium capitalize transition-colors",
                    settlement === s ? "bg-green-700 border-green-700 text-white" : "bg-white border-ink-300 text-ink-600"
                  )}
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                >
                  {s}
                </button>
              ))}
            </div>
            {settlement === "paid" && (
              <div>
                <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                  Receipt number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. OR-2026-0001"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-ink-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                />
              </div>
            )}
          </div>
        )}

        {submitError && (
          <p className="text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded font-semibold transition-colors",
              canConfirm ? "bg-green-700 text-white hover:bg-green-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            <CheckCircle2 size={15} />
            {submitting ? "Processing…" : "Confirm Return"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-2 rounded border border-ink-300 text-ink-600 hover:bg-ink-50 transition-colors"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2">
        <ScanLine size={15} className="text-green-700" />
        <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Scan or Type Accession Number
        </span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Scan or type — e.g. T45136"
            value={accessionInput}
            onChange={(e) => setAccessionInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFind()}
            autoFocus
            className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
          />
          <ScannerListener onScan={(v) => handleFind(v)} />
        </div>
        <button
          onClick={() => handleFind()}
          disabled={!accessionInput.trim() || loading}
          className={cn(
            "px-4 py-2 rounded font-semibold transition-colors",
            accessionInput.trim() ? "bg-green-700 text-white hover:bg-green-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
          )}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {loading ? "Finding…" : "Find"}
        </button>
      </div>

      <button
        onClick={() => setSearchOpen((v) => !v)}
        className="text-left text-ink-500 hover:text-ink-700 transition-colors"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
      >
        {searchOpen ? "Hide" : "Can't read the label? Search by title or borrower name →"}
      </button>

      {searchOpen && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Title or borrower name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchInput.trim() || searching}
              className="px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-ink-50 font-semibold transition-colors"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="flex flex-col gap-1">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setLoan(r)}
                  className="text-left px-3 py-2 rounded border border-ink-200 hover:bg-ink-50 transition-colors"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  <span className="font-medium text-ink-900">{r.books?.title ?? "Unknown title"}</span>
                  <span className="text-ink-400"> — {r.profiles?.full_name ?? "Unknown borrower"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>

      <ActiveBorrowersList
        loans={activeLoans}
        loading={loadingActiveLoans}
        onSelect={selectFromActiveList}
      />
    </div>
  )
}

// ─── Active Borrowers list ──────────────────────────────────────────────────
// Browse who currently has what instead of needing to already know an
// accession number — selecting one still runs the same lookupLoanByAccession
// verification a manual scan does (see ReturnPanel.selectFromActiveList).
function ActiveBorrowersList({
  loans,
  loading,
  onSelect,
}: {
  loans: ActiveLoan[]
  loading: boolean
  onSelect: (loan: ActiveLoan) => void
}) {
  const PAGE_SIZE = 5
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(loans.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = loans.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User size={15} className="text-green-700" />
          <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Active Borrowers
          </span>
        </div>
        {loans.length > 0 && (
          <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {loans.length} book{loans.length === 1 ? "" : "s"} out
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          Loading…
        </p>
      ) : loans.length === 0 ? (
        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          No books are currently out.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {paged.map((l) => {
              const overdue = l.status === "overdue"
              const canSelect = !!l.accession_number
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onSelect(l)}
                  disabled={!canSelect}
                  title={canSelect ? undefined : "No accession number on file for this copy — search by title or borrower name instead"}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded border text-left transition-colors",
                    canSelect ? "border-ink-200 hover:bg-ink-50 hover:border-ink-300" : "border-ink-100 opacity-50 cursor-not-allowed"
                  )}
                >
                  <BorrowerAvatar name={l.profiles?.full_name ?? null} avatarUrl={l.profiles?.avatar_url ?? null} />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink-900 font-medium truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                      {l.profiles?.full_name ?? "Unknown borrower"}
                    </p>
                    <p className="text-ink-400 truncate" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                      {l.books?.title ?? "Unknown title"}
                    </p>
                  </div>
                  {overdue ? (
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold shrink-0" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                      Overdue
                    </span>
                  ) : (
                    <span className="text-ink-400 shrink-0 whitespace-nowrap" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                      Due {formatDate(l.due_date)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  )
}

// ─── Reshelving queue ───────────────────────────────────────────────────────
// Browse list of every copy currently parked at for_reshelving — same
// "pick it instead of typing an accession number" convenience as the
// Return tab's Active Borrowers. Selecting a row just pre-fills the
// accession input below; confirming still requires the librarian to have
// the physical copy in hand, per ReshelvingPanel's own instruction.
function ReshelvingQueueList({
  items,
  loading,
  onSelect,
}: {
  items: ReshelvingQueueItem[]
  loading: boolean
  onSelect: (item: ReshelvingQueueItem) => void
}) {
  const PAGE_SIZE = 5
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck size={15} className="text-green-700" />
          <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Awaiting Reshelving
          </span>
        </div>
        {items.length > 0 && (
          <span className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {items.length} book{items.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          Nothing waiting to be reshelved right now.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {paged.map((item) => {
              const canSelect = !!item.accession_number
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  disabled={!canSelect}
                  title={canSelect ? undefined : "No accession number on file for this copy"}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded border text-left transition-colors",
                    canSelect ? "border-ink-200 hover:bg-ink-50 hover:border-ink-300" : "border-ink-100 opacity-50 cursor-not-allowed"
                  )}
                >
                  <BookCoverThumb
                    title={item.books?.title ?? "?"}
                    author={item.books?.author}
                    coverUrl={item.books?.cover_url}
                    coverColor={item.books?.cover_color}
                    width={32}
                    height={44}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-ink-900 font-medium truncate" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                      {item.books?.title ?? "Unknown title"}
                    </p>
                    <p className="text-ink-400 truncate" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                      {item.accession_number ?? "no accession no."}
                      {item.books?.call_number ? ` · ${item.books.call_number}` : ""}
                    </p>
                  </div>
                  {item.returned_at && (
                    <span className="text-ink-400 shrink-0 whitespace-nowrap" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                      Returned {formatDate(item.returned_at)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  )
}

// ─── Reshelving mode (Phase 4.7) ───────────────────────────────────────────────
function ReshelvingPanel({
  queue,
  loadingQueue,
  onSettled,
}: {
  queue: ReshelvingQueueItem[]
  loadingQueue: boolean
  onSettled: () => void
}) {
  const [accessionInput, setAccessionInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<"available" | "reserved" | "error" | null>(null)
  const [message, setMessage] = useState("")

  async function handleConfirm(overrideAccession?: string) {
    const value = (overrideAccession ?? accessionInput).trim()
    if (!value) return
    setAccessionInput(value)
    setSubmitting(true)
    try {
      const { status: copyStatus } = await reshelveCopy(value)
      // A reservation can form while a copy sits in for_reshelving — the
      // backend hands it straight to that hold instead of the open shelf,
      // so this scan doesn't always mean "now available" (loans.py's
      // reshelve_copy).
      const held = copyStatus === "reserved"
      setResult(held ? "reserved" : "available")
      onSettled()
      setAccessionInput("")
    } catch (err) {
      setResult("error")
      setMessage(err instanceof Error ? err.message : "Could not reshelve this copy")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-2">
          <ScanLine size={15} className="text-green-700" />
          <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Reshelving Mode
          </span>
        </div>
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          Scan a copy only after it&apos;s physically back on the shelf — this is the only action that makes a copy
          available again.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              placeholder="Scan or type — e.g. T45136"
              value={accessionInput}
              onChange={(e) => { setAccessionInput(e.target.value); setResult(null) }}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              autoFocus
              className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
            />
            {/* Highest-volume scan target on this page — auto-submits
                straight from the scan since reshelving needs no other
                manual field, so the librarian never has to touch the
                keyboard or mouse between copies. */}
            <ScannerListener onScan={(v) => handleConfirm(v)} />
          </div>
          <button
            onClick={() => handleConfirm()}
            disabled={!accessionInput.trim() || submitting}
            className={cn(
              "px-4 py-2 rounded font-semibold transition-colors",
              accessionInput.trim() ? "bg-green-700 text-white hover:bg-green-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
            )}
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {submitting ? "…" : "Confirm"}
          </button>
        </div>
        {result === "available" && (
          <p className="flex items-center gap-1.5 text-green-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <CheckCircle2 size={14} /> Copy is now available.
          </p>
        )}
        {result === "reserved" && (
          <p className="flex items-center gap-1.5 text-amber-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <CheckCircle2 size={14} /> Held for the next reservation — not on the open shelf.
          </p>
        )}
        {result === "error" && (
          <p className="flex items-center gap-1.5 text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <AlertCircle size={14} /> {message}
          </p>
        )}
      </div>

      <ReshelvingQueueList
        items={queue}
        loading={loadingQueue}
        onSelect={(item) => {
          if (!item.accession_number) return
          setAccessionInput(item.accession_number)
          setResult(null)
        }}
      />
    </div>
  )
}

function SessionList({ tab, records }: { tab: "borrow" | "return" | "reshelving"; records: SessionRecord[] }) {
  if (records.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 gap-2 text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <AlertCircle size={20} className="text-ink-300" />
        No {tab === "borrow" ? "borrows" : tab === "return" ? "returns" : "reshelves"} yet today.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {records.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-ink-100 last:border-0">
          <div className="min-w-0">
            <p className="text-ink-900 font-medium truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              {r.title}
            </p>
            <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {r.patron} · {r.time}{r.note ? ` · ${r.note}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Guest / In-House (Phase 7) ────────────────────────────────────────────────
// Entirely librarian-driven — a guest never signs in and never touches this
// screen. A single form check outs a copy for library-use-only, same-day
// use; a separate list below returns it. Deliberately styled in amber/purple
// rather than green throughout, so an in-house loan reads as visibly
// distinct from a real student loan at a glance (plan 7's acceptance
// criterion), not just distinct in the data model.

const VISITOR_TYPES: { value: VisitorType; label: string }[] = [
  { value: "nocei", label: "NOCEI-affiliated" },
  { value: "non_nocei", label: "Non-NOCEI (₱50 fee)" },
]

const GUEST_PURPOSES: { value: GuestPurpose; label: string }[] = [
  { value: "library_use", label: "Library use" },
  { value: "photocopy", label: "Photocopy" },
]

function GuestPanel({ onSettled }: { onSettled: () => void }) {
  const guestNameRef = useRef<HTMLInputElement>(null)
  const [accessionInput, setAccessionInput] = useState("")
  const [guestName, setGuestName] = useState("")
  const [guestIdNumber, setGuestIdNumber] = useState("")
  const [visitorType, setVisitorType] = useState<VisitorType>("nocei")
  const [feePaid, setFeePaid] = useState(false)
  const [receiptNumber, setReceiptNumber] = useState("")
  const [purpose, setPurpose] = useState<GuestPurpose>("library_use")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [confirmed, setConfirmed] = useState<{ title: string; guest: string } | null>(null)

  const requiresFee = visitorType === "non_nocei"
  const canConfirm =
    accessionInput.trim().length > 0 &&
    guestName.trim().length > 0 &&
    guestIdNumber.trim().length > 0 &&
    (!requiresFee || (feePaid && receiptNumber.trim().length > 0)) &&
    !submitting

  function reset() {
    setAccessionInput("")
    setGuestName("")
    setGuestIdNumber("")
    setVisitorType("nocei")
    setFeePaid(false)
    setReceiptNumber("")
    setPurpose("library_use")
    setNotes("")
    setSubmitError("")
    setConfirmed(null)
  }

  async function handleConfirm() {
    if (!canConfirm) return
    setSubmitting(true)
    setSubmitError("")
    try {
      const loan = await createInHouseLoan({
        accessionNumber: accessionInput.trim(),
        guestName: guestName.trim(),
        guestIdNumber: guestIdNumber.trim(),
        visitorType,
        feePaid,
        receiptNumber: requiresFee ? receiptNumber.trim() : undefined,
        purpose,
        notes: notes || undefined,
      })
      setConfirmed({ title: loan.books?.title ?? "Unknown title", guest: loan.guest_name })
      onSettled()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not check out this item")
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmed) {
    return (
      <div className="rounded border border-purple-200 bg-purple-50 p-6 flex flex-col items-center gap-3 text-center">
        <ScannerListener onScan={(v) => { reset(); setAccessionInput(v) }} />
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-purple-100">
          <CheckCircle2 size={26} className="text-purple-700" />
        </div>
        <div>
          <p className="text-purple-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
            Checked Out for In-House Use
          </p>
          <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <span className="font-medium text-ink-700">{confirmed.title}</span> — {confirmed.guest}
          </p>
          <p className="text-ink-400 mt-1" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            Reminder: the RFID tag stays armed — this copy is not leaving the building.
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-white transition-colors font-medium"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <RotateCcw size={13} />
          Check Out Another
        </button>
      </div>
    )
  }

  return (
    <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2">
        <UserPlus size={15} className="text-purple-700" />
        <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Guest In-House Checkout
        </span>
      </div>
      <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
        Library use or photocopy only — item does not leave the building, returned the same day. Requires a referral
        letter, valid ID, and gate pass per LRC visitor policy.
      </p>

      <div>
        <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
          Accession Number <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Scan or type — e.g. T45136"
            value={accessionInput}
            onChange={(e) => setAccessionInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guestNameRef.current?.focus()}
            autoFocus
            className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
          />
          {/* Nothing here submits on its own — guest name/ID still need to
              be filled in by hand — so a scan just fills the field and
              advances focus for that next manual step. */}
          <ScannerListener onScan={setAccessionInput} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
            Guest Name <span className="text-red-500">*</span>
          </label>
          <input
            ref={guestNameRef}
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
        <div>
          <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
            Valid ID Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={guestIdNumber}
            onChange={(e) => setGuestIdNumber(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
      </div>

      <div>
        <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
          Visitor Type
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {VISITOR_TYPES.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => { setVisitorType(v.value); if (v.value === "nocei") { setFeePaid(false); setReceiptNumber("") } }}
              className={cn(
                "px-3 py-1.5 rounded border font-medium transition-colors",
                visitorType === v.value ? "bg-purple-700 border-purple-700 text-white" : "bg-white border-ink-300 text-ink-600 hover:border-ink-400"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {requiresFee && (
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              <input
                type="checkbox"
                checked={feePaid}
                onChange={(e) => { setFeePaid(e.target.checked); if (!e.target.checked) setReceiptNumber("") }}
              />
              ₱50.00 visitor fee collected
            </label>
            {feePaid && (
              <div>
                <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
                  Receipt number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. OR-2026-0001"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
          Purpose
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {GUEST_PURPOSES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPurpose(p.value)}
              className={cn(
                "px-3 py-1.5 rounded border font-medium transition-colors",
                purpose === p.value ? "bg-purple-700 border-purple-700 text-white" : "bg-white border-ink-300 text-ink-600 hover:border-ink-400"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        placeholder="Notes (optional) — e.g. research topic, referral letter reference"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 rounded border border-ink-300 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      />

      {submitError && (
        <p className="text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          {submitError}
        </p>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className={cn(
          "flex items-center justify-center gap-2 py-2 rounded font-semibold transition-colors",
          canConfirm ? "bg-purple-700 text-white hover:bg-purple-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
        )}
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <CheckCircle2 size={15} />
        {submitting ? "Processing…" : "Check Out"}
      </button>
    </div>
  )
}

function InHouseActiveList({ loans, onReturn }: { loans: InHouseLoan[]; onReturn: (id: string) => void }) {
  const [returningId, setReturningId] = useState<string | null>(null)

  async function handleReturn(id: string) {
    setReturningId(id)
    try {
      await returnInHouseLoan(id)
      onReturn(id)
    } finally {
      setReturningId(null)
    }
  }

  if (loans.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 gap-2 text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <AlertCircle size={20} className="text-ink-300" />
        No in-house items checked out right now.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {loans.map((loan) => (
        <div key={loan.id} className="flex items-center justify-between gap-3 py-2 border-b border-ink-100 last:border-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className="shrink-0 px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-700 font-semibold uppercase"
                style={{ fontFamily: "var(--font-body)", fontSize: "9px", letterSpacing: "var(--tracking-micro)" }}
              >
                Guest
              </span>
              <p className="text-ink-900 font-medium truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                {loan.books?.title ?? "Unknown title"}
              </p>
            </div>
            <p className="text-ink-400 truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
              {loan.guest_name} · {loan.accession_number} ·{" "}
              {new Date(loan.checked_out_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
          <button
            onClick={() => handleReturn(loan.id)}
            disabled={returningId === loan.id}
            className="shrink-0 px-3 py-1.5 rounded border border-ink-300 text-ink-600 hover:bg-ink-50 font-medium transition-colors disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
          >
            {returningId === loan.id ? "…" : "Return"}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const VALID_TABS: Tab[] = ["borrow", "return", "reshelving", "guest"]

function BorrowAndReturnPageContent() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab")
    return VALID_TABS.includes(requested as Tab) ? (requested as Tab) : "borrow"
  })
  const [borrowedToday, setBorrowedToday] = useState<SessionRecord[]>([])
  const [returnedToday, setReturnedToday] = useState<SessionRecord[]>([])
  const [reshelvedToday, setReshelvedToday] = useState<SessionRecord[]>([])
  const [activeInHouseLoans, setActiveInHouseLoans] = useState<InHouseLoan[]>([])

  // Real data (GET /loans, GET /loans/reshelved), not browser memory — this
  // is what actually makes "Today" survive a refresh or a shift change,
  // resetting only because tomorrow's todayRangeIso() genuinely excludes it.
  const loadBorrowedToday = useCallback(() => {
    const { from, to } = todayRangeIso()
    fetchLoansInRange({ borrowedFrom: from, borrowedTo: to })
      .then((loans) => setBorrowedToday(loans.map((l) => loanToSessionRecord(l, "borrowed_at"))))
      .catch(() => {})
  }, [])

  const loadReturnedToday = useCallback(() => {
    const { from, to } = todayRangeIso()
    fetchLoansInRange({ returnedFrom: from, returnedTo: to })
      .then((loans) => setReturnedToday(loans.map((l) => loanToSessionRecord(l, "returned_at"))))
      .catch(() => {})
  }, [])

  const loadReshelvedToday = useCallback(() => {
    const { from, to } = todayRangeIso()
    fetchReshelvedInRange({ reshelvedFrom: from, reshelvedTo: to })
      .then((items) => setReshelvedToday(items.map(reshelvedToSessionRecord)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadBorrowedToday()
    loadReturnedToday()
    loadReshelvedToday()
  }, [loadBorrowedToday, loadReturnedToday, loadReshelvedToday])

  const loadInHouseLoans = useCallback(() => {
    fetchInHouseLoans("active").then(setActiveInHouseLoans).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === "guest") loadInHouseLoans()
  }, [tab, loadInHouseLoans])

  // "Ongoing" — what's currently out and what's currently waiting to go
  // back on the shelf. Loaded once at the page level (not lazily per tab)
  // so the tab switcher can show a live count on Return/Reshelving
  // without making the librarian open each tab just to find out.
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([])
  const [loadingActiveLoans, setLoadingActiveLoans] = useState(true)
  const loadActiveLoans = useCallback(() => {
    listActiveLoans().then(setActiveLoans).catch(() => {}).finally(() => setLoadingActiveLoans(false))
  }, [])

  const [reshelvingQueue, setReshelvingQueue] = useState<ReshelvingQueueItem[]>([])
  const [loadingReshelvingQueue, setLoadingReshelvingQueue] = useState(true)
  const loadReshelvingQueue = useCallback(() => {
    fetchReshelvingQueue().then(setReshelvingQueue).catch(() => {}).finally(() => setLoadingReshelvingQueue(false))
  }, [])

  useEffect(() => {
    loadActiveLoans()
    loadReshelvingQueue()
  }, [loadActiveLoans, loadReshelvingQueue])

  // A confirmed return can move a copy onto either list (out of Active
  // Borrowers, and — usually — onto the Reshelving queue), so refresh
  // both rather than guessing which one changed.
  function handleReturned() {
    loadReturnedToday()
    loadActiveLoans()
    loadReshelvingQueue()
  }

  function handleReshelved() {
    loadReshelvedToday()
    loadReshelvingQueue()
  }

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "borrow", label: "Borrow",  icon: <BookOpen size={14} /> },
    { key: "return", label: "Return", icon: <RotateCcw size={14} />, count: activeLoans.length },
    { key: "reshelving", label: "Reshelving", icon: <PackageCheck size={14} />, count: reshelvingQueue.length },
    { key: "guest", label: "Guest / In-House", icon: <UserPlus size={14} /> },
  ]

  return (
    <div className="p-4 sm:p-6">
      {/* ── Page header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1
            className="text-ink-900 font-semibold"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}
          >
            Borrow &amp; Return
          </h1>
          <p
            className="text-ink-400 mt-0.5"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {today}
          </p>
        </div>

        {/* Tab switcher — Return/Reshelving carry a live count so the
            librarian can see what's waiting without opening either tab */}
        <div className="flex items-center gap-1 p-1 rounded bg-ink-100 self-start">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded font-semibold transition-colors",
                tab === t.key ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {t.icon}
              {t.label}
              {!!t.count && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full font-semibold",
                    tab === t.key ? "bg-green-100 text-green-800" : "bg-white text-ink-600"
                  )}
                  style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* Left: scanner / lookup */}
        {tab === "borrow" && <AssistedBorrowPanel onSettled={loadBorrowedToday} />}
        {tab === "return" && (
          <ReturnPanel
            activeLoans={activeLoans}
            loadingActiveLoans={loadingActiveLoans}
            onSettled={handleReturned}
          />
        )}
        {tab === "reshelving" && (
          <ReshelvingPanel
            queue={reshelvingQueue}
            loadingQueue={loadingReshelvingQueue}
            onSettled={handleReshelved}
          />
        )}
        {tab === "guest" && <GuestPanel onSettled={loadInHouseLoans} />}

        {/* Right: records — today's, for Borrow (old schema); this session's, for Return/Reshelving (new schema, no history endpoint yet); currently-out, for Guest.
            Title + count live inside the card (matching ActiveBorrowersList/
            ReshelvingQueueList's own header row) so this card's top edge lines
            up with the left panel's, instead of sitting a heading's-height
            lower than it. */}
        <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {tab === "borrow" && <BookOpen size={15} className="text-green-700" />}
              {tab === "return" && <RotateCcw size={15} className="text-green-700" />}
              {tab === "reshelving" && <PackageCheck size={15} className="text-green-700" />}
              {tab === "guest" && <UserPlus size={15} className="text-purple-700" />}
              <span
                className="text-ink-900 font-semibold"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
                {tab === "borrow" ? "Borrowed Today" : tab === "return" ? "Returned Today" : tab === "reshelving" ? "Reshelved Today" : "Currently Out (In-House)"}
              </span>
            </div>
            <span
              className="text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {(tab === "borrow" ? borrowedToday.length : tab === "return" ? returnedToday.length : tab === "reshelving" ? reshelvedToday.length : activeInHouseLoans.length)} records
            </span>
          </div>
          {tab === "borrow" && <SessionList tab="borrow" records={borrowedToday} />}
          {tab === "return" && <SessionList tab="return" records={returnedToday} />}
          {tab === "reshelving" && <SessionList tab="reshelving" records={reshelvedToday} />}
          {tab === "guest" && <InHouseActiveList loans={activeInHouseLoans} onReturn={loadInHouseLoans} />}
        </div>
      </div>
    </div>
  )
}

export default function BorrowAndReturnPage() {
  return (
    <Suspense fallback={null}>
      <BorrowAndReturnPageContent />
    </Suspense>
  )
}
