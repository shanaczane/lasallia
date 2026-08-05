// Sprint 5.4 / 7.1 – Quick Scanner Interface, wired to the real borrow/return API
"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  ScanLine,
  Camera,
  Keyboard,
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
import { Book, BorrowTransaction } from "@lasallia/types"
import { useBooks } from "@/lib/hooks/useBooks"
import { useBorrowTransactions } from "@/lib/hooks/useBorrowTransactions"
import { createBorrow, returnBorrow } from "@/lib/borrow"
import {
  lookupLoanByAccession,
  searchLoans,
  confirmReturn,
  reshelveCopy,
  type LoanLookupResult,
  type ReturnCondition,
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
// "return" here is the new loans/book_copies-schema flow (Phase 4) —
// separate from "borrow", which is untouched and still runs on the older
// borrow_transactions schema.
type Tab = "borrow" | "return" | "reshelving" | "guest"
type InputMode = "camera" | "usb"
type ScanState = "idle" | "scanning" | "found" | "notfound" | "confirmed"

interface BookResult {
  isbn: string
  title: string
  author: string
  callNo: string
  floor: string
  aisle: string
  available: number
  total: number
  color: string
  borrowedBy?: string
  borrowedByEmail?: string
  dueDate?: string
}

interface TxRecord {
  id: string
  title: string
  patron: string
  patronEmail: string
  time: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function findBookByCode(books: Book[], code: string): Book | undefined {
  const needle = code.trim().toLowerCase()
  if (!needle) return undefined
  return books.find(
    (b) => b.isbn?.toLowerCase() === needle || b.accession_no?.toLowerCase() === needle
  )
}

function toBookResult(book: Book, activeTx?: BorrowTransaction): BookResult {
  return {
    isbn: book.isbn ?? book.accession_no ?? "—",
    title: book.title,
    author: book.author,
    callNo: book.call_number,
    floor: book.floor ?? "—",
    aisle: book.aisle ?? "—",
    available: book.available_copies ?? 0,
    total: book.total_copies ?? 0,
    color: book.cover_color ?? "#2563EB",
    borrowedBy: activeTx?.profiles?.full_name ?? activeTx?.profiles?.email,
    borrowedByEmail: activeTx?.profiles?.email,
    dueDate: activeTx
      ? new Date(activeTx.due_date).toLocaleDateString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : undefined,
  }
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function toTxRecord(tx: BorrowTransaction): TxRecord {
  const timestamp = tx.status === "returned" && tx.returned_at ? tx.returned_at : tx.borrowed_at
  return {
    id: tx.id,
    title: tx.books?.title ?? "Unknown title",
    patron: tx.profiles?.full_name ?? tx.profiles?.email ?? "Unknown patron",
    patronEmail: tx.profiles?.email ?? "—",
    time: new Date(timestamp).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  }
}

// ─── Camera placeholder ───────────────────────────────────────────────────────
function CameraViewfinder({ scanning }: { scanning: boolean }) {
  return (
    <div
      className="relative w-full rounded overflow-hidden bg-[#0d0d0d] flex items-center justify-center"
      style={{ aspectRatio: "4/3", maxHeight: 240 }}
    >
      <div className="absolute inset-0 bg-black/50" />

      {/* Corner frame */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative" style={{ width: "54%", height: "54%" }}>
          {(["tl", "tr", "bl", "br"] as const).map((c) => (
            <span
              key={c}
              className="absolute w-5 h-5 border-white"
              style={{
                borderTopWidth: c[0] === "t" ? 2 : 0,
                borderBottomWidth: c[0] === "b" ? 2 : 0,
                borderLeftWidth: c[1] === "l" ? 2 : 0,
                borderRightWidth: c[1] === "r" ? 2 : 0,
                top: c[0] === "t" ? 0 : "auto",
                bottom: c[0] === "b" ? 0 : "auto",
                left: c[1] === "l" ? 0 : "auto",
                right: c[1] === "r" ? 0 : "auto",
              }}
            />
          ))}

          {scanning && (
            <div
              className="absolute left-0 right-0"
              style={{
                height: 2,
                background: "linear-gradient(90deg, transparent, #00d26a, transparent)",
                animation: "scanline 1.6s ease-in-out infinite",
              }}
            />
          )}
        </div>
      </div>

      {!scanning && (
        <div className="relative z-10 flex flex-col items-center gap-2 text-white/25">
          <Camera size={40} />
        </div>
      )}

      <p
        className="absolute bottom-3 text-white/60 text-center px-4 leading-snug"
        style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
      >
        {scanning ? "Detecting barcode…" : "Point camera at QR code or barcode"}
      </p>

      <style>{`
        @keyframes scanline {
          0%, 100% { top: 8%; }
          50%       { top: 86%; }
        }
      `}</style>
    </div>
  )
}

// ─── Book result card ─────────────────────────────────────────────────────────
function BookResultCard({
  book,
  tab,
  submitting,
  submitError,
  onConfirm,
  onReset,
}: {
  book: BookResult
  tab: Tab
  submitting: boolean
  submitError: string
  onConfirm: (patronEmail: string) => void
  onReset: () => void
}) {
  const [patronEmail, setPatronEmail] = useState("")
  const canConfirm = (tab === "return" || patronEmail.trim().length > 0) && !submitting

  return (
    <div className="rounded border border-green-200 bg-green-50 p-4 flex flex-col gap-3">
      {/* Book info */}
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 rounded flex items-center justify-center text-white font-bold"
          style={{
            width: 48,
            height: 66,
            background: book.color,
            fontFamily: "var(--font-display)",
            fontSize: "1.25rem",
          }}
        >
          {book.title[0]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CheckCircle2 size={13} className="text-green-700 shrink-0" />
            <span
              className="text-green-700 font-semibold uppercase"
              style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)", letterSpacing: "var(--tracking-micro)" }}
            >
              Book Found
            </span>
          </div>
          <p
            className="text-ink-900 font-semibold leading-snug"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
          >
            {book.title}
          </p>
          <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            {book.author}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span
              className="flex items-center gap-1 text-ink-500"
              style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
            >
              <Hash size={11} /> {book.callNo}
            </span>
            <span
              className="flex items-center gap-1 text-ink-500"
              style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
            >
              <MapPin size={11} /> {book.floor}, {book.aisle}
            </span>
          </div>

          {tab === "borrow" && (
            <span
              className={cn(
                "inline-block mt-1.5 px-2 py-0.5 rounded-sm font-medium",
                book.available > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
              )}
              style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
            >
              {book.available > 0 ? `${book.available} / ${book.total} available` : "No copies available"}
            </span>
          )}
        </div>
      </div>

      {/* Return: borrower info */}
      {tab === "return" && book.borrowedBy && (
        <div className="rounded bg-white border border-ink-200 px-3 py-2">
          <p className="text-ink-400" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
            Currently borrowed by
          </p>
          <p className="text-ink-900 font-semibold" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
            {book.borrowedBy}{" "}
            {book.borrowedByEmail && <span className="text-ink-400 font-normal">({book.borrowedByEmail})</span>}
          </p>
          {book.dueDate && (
            <p className="text-ink-500 mt-0.5" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
              Due:{" "}
              <span className="text-amber-700 font-semibold">{book.dueDate}</span>
            </p>
          )}
        </div>
      )}

      {/* Borrow: patron input */}
      {tab === "borrow" && book.available > 0 && (
        <div>
          <label
            className="block text-ink-700 mb-1"
            style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
          >
            Patron Email <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="email"
              placeholder="e.g. juan.delacruz@dlsl.edu.ph"
              value={patronEmail}
              onChange={(e) => setPatronEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canConfirm && onConfirm(patronEmail)}
              className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            />
          </div>
        </div>
      )}

      {submitError && (
        <p className="text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          {submitError}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm(patronEmail)}
          disabled={!canConfirm || (tab === "borrow" && book.available === 0)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded font-semibold transition-colors",
            canConfirm && !(tab === "borrow" && book.available === 0)
              ? "bg-green-700 text-white hover:bg-green-800"
              : "bg-ink-200 text-ink-400 cursor-not-allowed"
          )}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <CheckCircle2 size={15} />
          {submitting ? "Processing…" : tab === "borrow" ? "Confirm Borrow" : "Confirm Return"}
        </button>
        <button
          onClick={onReset}
          className="px-3 py-2 rounded border border-ink-300 text-ink-600 hover:bg-ink-50 transition-colors"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Not-found panel ──────────────────────────────────────────────────────────
function NotFoundPanel({ tab, onReset }: { tab: Tab; onReset: () => void }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-6 flex flex-col items-center gap-3 text-center">
      <AlertCircle size={26} className="text-red-600" />
      <p className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}>
        {tab === "borrow" ? "Book not found" : "No active loan found for this book"}
      </p>
      <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
        {tab === "borrow"
          ? "That ISBN or accession number doesn't match anything in the catalog."
          : "This book doesn't have a copy currently checked out."}
      </p>
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-white transition-colors font-medium"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <RotateCcw size={13} />
        Try Again
      </button>
    </div>
  )
}

// ─── Success banner ───────────────────────────────────────────────────────────
function SuccessBanner({
  tab,
  title,
  patron,
  onReset,
}: {
  tab: Tab
  title: string
  patron: string
  onReset: () => void
}) {
  return (
    <div className="rounded border border-green-200 bg-green-50 p-6 flex flex-col items-center gap-3 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
        <CheckCircle2 size={26} className="text-green-700" />
      </div>
      <div>
        <p
          className="text-green-900 font-semibold"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
        >
          {tab === "borrow" ? "Book Borrowed Successfully" : "Book Returned Successfully"}
        </p>
        <p className="text-ink-500 mt-0.5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          <span className="font-medium text-ink-700">{title}</span>{" "}
          {tab === "borrow" ? "borrowed by" : "returned by"}{" "}
          <span className="font-medium text-ink-700">{patron}</span>
        </p>
      </div>
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 px-4 py-2 rounded border border-ink-300 text-ink-600 hover:bg-white transition-colors font-medium"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <RotateCcw size={13} />
        Scan Another
      </button>
    </div>
  )
}

// ─── Scanner panel (one per tab) ──────────────────────────────────────────────
function ScannerPanel({
  tab,
  books,
  activeTransactions,
  onSettled,
}: {
  tab: Tab
  books: Book[]
  activeTransactions: BorrowTransaction[]
  onSettled: () => void
}) {
  const [inputMode, setInputMode] = useState<InputMode>("camera")
  const [scanState, setScanState] = useState<ScanState>("idle")
  const [usbValue, setUsbValue] = useState("")
  const [cameraScanning, setCameraScanning] = useState(false)
  const [matchedBook, setMatchedBook] = useState<Book | null>(null)
  const [matchedTx, setMatchedTx] = useState<BorrowTransaction | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [confirmed, setConfirmed] = useState<{ title: string; patron: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const resolveMatch = (book: Book | undefined) => {
    if (!book) {
      setScanState("notfound")
      return
    }
    if (tab === "return") {
      const tx = activeTransactions.find((t) => t.book_id === book.id)
      if (!tx) {
        setScanState("notfound")
        return
      }
      setMatchedBook(book)
      setMatchedTx(tx)
    } else {
      setMatchedBook(book)
      setMatchedTx(undefined)
    }
    setScanState("found")
  }

  const handleCameraStart = () => {
    setCameraScanning(true)
    setScanState("scanning")
    setTimeout(() => {
      setCameraScanning(false)
      const demo =
        tab === "borrow"
          ? books.find((b) => (b.available_copies ?? 0) > 0)
          : activeTransactions[0]?.books
      resolveMatch(demo)
    }, 2200)
  }

  const handleUsbSubmit = () => {
    if (!usbValue.trim()) return
    setScanState("scanning")
    setTimeout(() => resolveMatch(findBookByCode(books, usbValue)), 600)
  }

  const handleConfirm = async (patronEmail: string) => {
    if (!matchedBook) return
    setSubmitting(true)
    setSubmitError("")
    try {
      if (tab === "borrow") {
        await createBorrow(matchedBook.id, patronEmail)
        setConfirmed({ title: matchedBook.title, patron: patronEmail })
      } else {
        if (!matchedTx) return
        await returnBorrow(matchedTx.id)
        setConfirmed({
          title: matchedBook.title,
          patron: matchedTx.profiles?.full_name ?? matchedTx.profiles?.email ?? "Unknown",
        })
      }
      setScanState("confirmed")
      onSettled()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setScanState("idle")
    setUsbValue("")
    setCameraScanning(false)
    setMatchedBook(null)
    setMatchedTx(undefined)
    setSubmitError("")
    setConfirmed(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Scanner card ─────────────────────────────────── */}
      {scanState !== "confirmed" && scanState !== "notfound" && (
        <div className="rounded border border-ink-200 bg-white" style={{ boxShadow: "var(--shadow)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
            <div className="flex items-center gap-2">
              <ScanLine size={15} className="text-green-700" />
              <span
                className="text-ink-900 font-semibold"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
                Scan a Book
              </span>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-0.5 p-0.5 rounded bg-ink-100">
              {(["camera", "usb"] as InputMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setInputMode(m); setScanState("idle"); setUsbValue("") }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors",
                    inputMode === m ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-700"
                  )}
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                >
                  {m === "camera" ? <Camera size={11} /> : <Keyboard size={11} />}
                  {m === "camera" ? "Camera" : "USB / Manual"}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Camera mode */}
            {inputMode === "camera" && (
              <>
                <CameraViewfinder scanning={cameraScanning} />
                {scanState === "idle" && (
                  <button
                    onClick={handleCameraStart}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-green-700 text-white hover:bg-green-800 font-semibold transition-colors"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    <Camera size={15} />
                    Start Camera
                  </button>
                )}
                {scanState === "scanning" && (
                  <div
                    className="flex items-center justify-center gap-2 py-2 text-ink-500"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    <span className="w-4 h-4 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
                    Detecting barcode…
                  </div>
                )}
              </>
            )}

            {/* USB / Manual mode */}
            {inputMode === "usb" && (
              <div className="flex flex-col gap-2">
                <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
                  Scan with USB barcode reader or type ISBN/accession no. manually
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="ISBN or accession no.…"
                      value={usbValue}
                      onChange={(e) => setUsbValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUsbSubmit()}
                      autoFocus
                      className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                    />
                  </div>
                  <button
                    onClick={handleUsbSubmit}
                    disabled={!usbValue.trim()}
                    className={cn(
                      "px-4 py-2 rounded font-semibold transition-colors",
                      usbValue.trim()
                        ? "bg-green-700 text-white hover:bg-green-800"
                        : "bg-ink-200 text-ink-400 cursor-not-allowed"
                    )}
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                  >
                    Search
                  </button>
                </div>
                {scanState === "scanning" && (
                  <div
                    className="flex items-center gap-2 text-ink-500"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                  >
                    <span className="w-3 h-3 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
                    Looking up book…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Book result ───────────────────────────────────── */}
      {scanState === "found" && matchedBook && (
        <BookResultCard
          book={toBookResult(matchedBook, matchedTx)}
          tab={tab}
          submitting={submitting}
          submitError={submitError}
          onConfirm={handleConfirm}
          onReset={handleReset}
        />
      )}

      {/* ── Not found ─────────────────────────────────────── */}
      {scanState === "notfound" && <NotFoundPanel tab={tab} onReset={handleReset} />}

      {/* ── Success ───────────────────────────────────────── */}
      {scanState === "confirmed" && confirmed && (
        <SuccessBanner
          tab={tab}
          title={confirmed.title}
          patron={confirmed.patron}
          onReset={handleReset}
        />
      )}
    </div>
  )
}

// ─── Transactions table ───────────────────────────────────────────────────────
function TransactionsTable({ tab, records }: { tab: Tab; records: TxRecord[] }) {
  if (records.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 gap-2 text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <AlertCircle size={20} className="text-ink-300" />
        No {tab === "borrow" ? "borrows" : "returns"} recorded today.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-95">
        <thead>
          <tr className="border-b border-ink-200">
            {["Book", "Patron", "Email", "Time"].map((h) => (
              <th
                key={h}
                className="pb-2 text-left text-ink-400 font-semibold"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-2xs)",
                  letterSpacing: "var(--tracking-micro)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((tx) => (
            <tr key={tx.id} className="border-b border-ink-100 hover:bg-ink-50 transition-colors">
              <td className="py-2.5 pr-4 max-w-40">
                <p
                  className="text-ink-900 font-medium truncate"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {tx.title}
                </p>
              </td>
              <td className="py-2.5 pr-4">
                <p
                  className="text-ink-700"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {tx.patron}
                </p>
              </td>
              <td className="py-2.5 pr-4">
                <p
                  className="text-ink-400"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}
                >
                  {tx.patronEmail}
                </p>
              </td>
              <td className="py-2.5">
                <div
                  className="flex items-center gap-1 text-ink-400"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                >
                  <Clock size={11} />
                  {tx.time}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Return flow (Phase 4, new loans/book_copies schema) ──────────────────────
// Separate from ScannerPanel/BookResultCard above, which stay borrow-only and
// untouched. No fake camera here — a plain accession-number input plus a
// title/borrower fallback search is what plan 4.1 actually needs.

type SessionRecord = { title: string; patron: string; time: string; note?: string }

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

function ReturnPanel({ onSettled }: { onSettled: (record: SessionRecord) => void }) {
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
  const [confirmed, setConfirmed] = useState<{ title: string; patron: string; fine: number } | null>(null)

  const isNewDamage = !!loan && loan.condition_at_borrow === "good" && (condition === "damaged" || condition === "incomplete")
  const previewTotal = loan
    ? loan.preview_fine_amount + (isNewDamage ? (parseFloat(replacementCost) || 0) + 50 : 0)
    : 0

  async function handleFind() {
    if (!accessionInput.trim()) return
    setLoading(true)
    setNotFound(false)
    try {
      const result = await lookupLoanByAccession(accessionInput.trim())
      setLoan(result)
    } catch (err) {
      setNotFoundMessage(err instanceof Error ? err.message : "No active loan found for that copy")
      setNotFound(true)
    } finally {
      setLoading(false)
    }
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
      setConfirmed({ title: loan.books?.title ?? "Unknown title", patron, fine })
      onSettled({
        title: loan.books?.title ?? "Unknown title",
        patron,
        time: new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
        note: fine > 0 ? `₱${fine.toFixed(2)} fine` : undefined,
      })
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
          <div
            className="shrink-0 rounded flex items-center justify-center text-white font-bold"
            style={{ width: 48, height: 66, background: loan.books?.cover_color ?? "#2563EB", fontFamily: "var(--font-display)", fontSize: "1.25rem" }}
          >
            {loan.books?.title?.[0] ?? "?"}
          </div>
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
              <input
                type="text"
                placeholder="Receipt number"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                className="w-full px-3 py-2 rounded border border-ink-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              />
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
            placeholder="e.g. T45136"
            value={accessionInput}
            onChange={(e) => setAccessionInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFind()}
            autoFocus
            className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
        <button
          onClick={handleFind}
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
  )
}

// ─── Reshelving mode (Phase 4.7) ───────────────────────────────────────────────
function ReshelvingPanel({ onSettled }: { onSettled: (record: SessionRecord) => void }) {
  const [accessionInput, setAccessionInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<"success" | "error" | null>(null)
  const [message, setMessage] = useState("")

  async function handleConfirm() {
    if (!accessionInput.trim()) return
    setSubmitting(true)
    try {
      await reshelveCopy(accessionInput.trim())
      setResult("success")
      onSettled({
        title: accessionInput.trim(),
        patron: "—",
        time: new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
        note: "Now available",
      })
      setAccessionInput("")
    } catch (err) {
      setResult("error")
      setMessage(err instanceof Error ? err.message : "Could not reshelve this copy")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded border border-ink-200 bg-white p-4 flex flex-col gap-3" style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-center gap-2">
        <PackageCheck size={15} className="text-green-700" />
        <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Reshelving Mode
        </span>
      </div>
      <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
        Scan a copy only after it's physically back on the shelf — this is the only action that makes a copy
        available again.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Hash size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="e.g. T45136"
            value={accessionInput}
            onChange={(e) => { setAccessionInput(e.target.value); setResult(null) }}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autoFocus
            className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
        <button
          onClick={handleConfirm}
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
      {result === "success" && (
        <p className="flex items-center gap-1.5 text-green-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          <CheckCircle2 size={14} /> Copy is now available.
        </p>
      )}
      {result === "error" && (
        <p className="flex items-center gap-1.5 text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          <AlertCircle size={14} /> {message}
        </p>
      )}
    </div>
  )
}

function SessionList({ tab, records }: { tab: "return" | "reshelving"; records: SessionRecord[] }) {
  if (records.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 gap-2 text-ink-400"
        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
      >
        <AlertCircle size={20} className="text-ink-300" />
        No {tab === "return" ? "returns" : "reshelves"} yet this session.
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
  const [accessionInput, setAccessionInput] = useState("")
  const [guestName, setGuestName] = useState("")
  const [guestIdNumber, setGuestIdNumber] = useState("")
  const [visitorType, setVisitorType] = useState<VisitorType>("nocei")
  const [feePaid, setFeePaid] = useState(false)
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
    (!requiresFee || feePaid) &&
    !submitting

  function reset() {
    setAccessionInput("")
    setGuestName("")
    setGuestIdNumber("")
    setVisitorType("nocei")
    setFeePaid(false)
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
            placeholder="e.g. T45136"
            value={accessionInput}
            onChange={(e) => setAccessionInput(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-ink-700 mb-1" style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}>
            Guest Name <span className="text-red-500">*</span>
          </label>
          <input
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
              onClick={() => { setVisitorType(v.value); if (v.value === "nocei") setFeePaid(false) }}
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
          <label className="flex items-center gap-2 mt-2 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
            <input type="checkbox" checked={feePaid} onChange={(e) => setFeePaid(e.target.checked)} />
            ₱50.00 visitor fee collected
          </label>
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
export default function BorrowAndReturnPage() {
  const [tab, setTab] = useState<Tab>("borrow")
  const [returnedThisSession, setReturnedThisSession] = useState<SessionRecord[]>([])
  const [reshelvedThisSession, setReshelvedThisSession] = useState<SessionRecord[]>([])
  const [activeInHouseLoans, setActiveInHouseLoans] = useState<InHouseLoan[]>([])
  const { books } = useBooks()
  const { transactions, refresh } = useBorrowTransactions()

  const loadInHouseLoans = useCallback(() => {
    fetchInHouseLoans("active").then(setActiveInHouseLoans).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === "guest") loadInHouseLoans()
  }, [tab, loadInHouseLoans])

  const activeTransactions = transactions.filter((t) => t.status === "active")
  const todaysBorrows = transactions.filter((t) => isToday(t.borrowed_at)).map(toTxRecord)

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "borrow", label: "Borrow",  icon: <BookOpen size={14} /> },
    { key: "return", label: "Return", icon: <RotateCcw size={14} /> },
    { key: "reshelving", label: "Reshelving", icon: <PackageCheck size={14} /> },
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

        {/* Tab switcher */}
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
            </button>
          ))}
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* Left: scanner / lookup */}
        {tab === "borrow" && (
          <ScannerPanel
            key={tab}
            tab={tab}
            books={books}
            activeTransactions={activeTransactions}
            onSettled={refresh}
          />
        )}
        {tab === "return" && (
          <ReturnPanel onSettled={(r) => setReturnedThisSession((prev) => [r, ...prev])} />
        )}
        {tab === "reshelving" && (
          <ReshelvingPanel onSettled={(r) => setReshelvedThisSession((prev) => [r, ...prev])} />
        )}
        {tab === "guest" && <GuestPanel onSettled={loadInHouseLoans} />}

        {/* Right: records — today's, for Borrow (old schema); this session's, for Return/Reshelving (new schema, no history endpoint yet); currently-out, for Guest */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-ink-900 font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
            >
              {tab === "borrow" ? "Today's Borrows" : tab === "return" ? "Returned This Session" : tab === "reshelving" ? "Reshelved This Session" : "Currently Out (In-House)"}
            </h2>
            <span
              className="text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {(tab === "borrow" ? todaysBorrows.length : tab === "return" ? returnedThisSession.length : tab === "reshelving" ? reshelvedThisSession.length : activeInHouseLoans.length)} records
            </span>
          </div>
          <div
            className="rounded border border-ink-200 bg-white p-4"
            style={{ boxShadow: "var(--shadow)" }}
          >
            {tab === "borrow" && <TransactionsTable tab={tab} records={todaysBorrows} />}
            {tab === "return" && <SessionList tab="return" records={returnedThisSession} />}
            {tab === "reshelving" && <SessionList tab="reshelving" records={reshelvedThisSession} />}
            {tab === "guest" && <InHouseActiveList loans={activeInHouseLoans} onReturn={loadInHouseLoans} />}
          </div>
        </div>
      </div>
    </div>
  )
}
