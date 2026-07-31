// Sprint 5.4 / 7.1 – Quick Scanner Interface, wired to the real borrow/return API
"use client"

import { useState, useRef } from "react"
import {
  ScanLine,
  Camera,
  Keyboard,
  CheckCircle2,
  User,
  BookOpen,
  MapPin,
  Hash,
  Clock,
  Search,
  RotateCcw,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Book, BorrowTransaction } from "@lasallia/types"
import { useBooks } from "@/lib/hooks/useBooks"
import { useBorrowTransactions } from "@/lib/hooks/useBorrowTransactions"
import { createBorrow, returnBorrow } from "@/lib/borrow"

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "borrow" | "return"
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BorrowAndReturnPage() {
  const [tab, setTab] = useState<Tab>("borrow")
  const { books } = useBooks()
  const { transactions, refresh } = useBorrowTransactions()

  const activeTransactions = transactions.filter((t) => t.status === "active")
  const todaysBorrows = transactions.filter((t) => isToday(t.borrowed_at)).map(toTxRecord)
  const todaysReturns = transactions
    .filter((t) => t.status === "returned" && t.returned_at && isToday(t.returned_at))
    .map(toTxRecord)

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "borrow", label: "Borrow",  icon: <BookOpen size={14} /> },
    { key: "return", label: "Return", icon: <RotateCcw size={14} /> },
  ]

  const records = tab === "borrow" ? todaysBorrows : todaysReturns

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
        {/* Left: scanner */}
        <ScannerPanel
          key={tab}
          tab={tab}
          books={books}
          activeTransactions={activeTransactions}
          onSettled={refresh}
        />

        {/* Right: today's records */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-ink-900 font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
            >
              Today&apos;s {tab === "borrow" ? "Borrows" : "Returns"}
            </h2>
            <span
              className="text-ink-400"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
            >
              {records.length} records
            </span>
          </div>
          <div
            className="rounded border border-ink-200 bg-white p-4"
            style={{ boxShadow: "var(--shadow)" }}
          >
            <TransactionsTable tab={tab} records={records} />
          </div>
        </div>
      </div>
    </div>
  )
}
