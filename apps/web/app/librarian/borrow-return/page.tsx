// Sprint 5.4 – Quick Scanner Interface
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

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "borrow" | "return"
type InputMode = "camera" | "usb"
type ScanState = "idle" | "scanning" | "found" | "confirmed"

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
  borrowedById?: string
  dueDate?: string
}

interface TxRecord {
  id: string
  title: string
  patron: string
  patronId: string
  time: string
}

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_BORROW_BOOK: BookResult = {
  isbn: "978-3-16-148410-0",
  title: "Introduction to Data Science",
  author: "Dr. Maria Santos",
  callNo: "QA76.9.D37 S26 2021",
  floor: "Floor 2",
  aisle: "Aisle B4",
  available: 3,
  total: 5,
  color: "#2563EB",
}

const SAMPLE_RETURN_BOOK: BookResult = {
  isbn: "978-0-13-468599-1",
  title: "Clean Code: A Handbook of Agile Software Craftsmanship",
  author: "Robert C. Martin",
  callNo: "QA76.73.J38 M37 2008",
  floor: "Floor 3",
  aisle: "Aisle C2",
  available: 0,
  total: 2,
  color: "#DC2626",
  borrowedBy: "Juan dela Cruz",
  borrowedById: "2021-00123",
  dueDate: "July 5, 2026",
}

const INITIAL_BORROWS: TxRecord[] = [
  { id: "b1", title: "Fundamentals of Nursing", patron: "Ana Reyes", patronId: "2022-00456", time: "11:42 AM" },
  { id: "b2", title: "Calculus: Early Transcendentals", patron: "Mark Santos", patronId: "2023-00789", time: "10:15 AM" },
  { id: "b3", title: "Philippine History", patron: "Liza Villanueva", patronId: "2021-00234", time: "9:01 AM" },
]

const INITIAL_RETURNS: TxRecord[] = [
  { id: "r1", title: "Introduction to Data Science", patron: "Carlo Bautista", patronId: "2022-00567", time: "11:50 AM" },
  { id: "r2", title: "General Chemistry", patron: "Sofia Mendoza", patronId: "2023-00102", time: "10:38 AM" },
]

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
  onConfirm,
  onReset,
}: {
  book: BookResult
  tab: Tab
  onConfirm: (patronId: string) => void
  onReset: () => void
}) {
  const [patronId, setPatronId] = useState("")
  const canConfirm = tab === "return" || patronId.trim().length > 0

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
            <span className="text-ink-400 font-normal">({book.borrowedById})</span>
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
            Patron ID <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              placeholder="e.g. 2023-00123"
              value={patronId}
              onChange={(e) => setPatronId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canConfirm && onConfirm(patronId)}
              className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onConfirm(patronId)}
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
          {tab === "borrow" ? "Confirm Borrow" : "Confirm Return"}
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
function ScannerPanel({ tab }: { tab: Tab }) {
  const [inputMode, setInputMode] = useState<InputMode>("camera")
  const [scanState, setScanState] = useState<ScanState>("idle")
  const [usbValue, setUsbValue] = useState("")
  const [cameraScanning, setCameraScanning] = useState(false)
  const [confirmed, setConfirmed] = useState<{ title: string; patron: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const book = tab === "borrow" ? SAMPLE_BORROW_BOOK : SAMPLE_RETURN_BOOK

  const triggerScan = () => {
    setScanState("scanning")
    setTimeout(() => setScanState("found"), 900)
  }

  const handleCameraStart = () => {
    setCameraScanning(true)
    setScanState("scanning")
    setTimeout(() => {
      setCameraScanning(false)
      setScanState("found")
    }, 2200)
  }

  const handleUsbSubmit = () => {
    if (!usbValue.trim()) return
    triggerScan()
  }

  const handleConfirm = (patronId: string) => {
    setConfirmed({
      title: book.title,
      patron: tab === "return" ? (book.borrowedBy ?? "Unknown") : patronId,
    })
    setScanState("confirmed")
  }

  const handleReset = () => {
    setScanState("idle")
    setUsbValue("")
    setCameraScanning(false)
    setConfirmed(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Scanner card ─────────────────────────────────── */}
      {scanState !== "confirmed" && (
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
                  Scan with USB barcode reader or type ISBN manually
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="ISBN or barcode…"
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
      {scanState === "found" && (
        <BookResultCard book={book} tab={tab} onConfirm={handleConfirm} onReset={handleReset} />
      )}

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
            {["Book", "Patron", "ID No.", "Time"].map((h) => (
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
                  {tx.patronId}
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
        <ScannerPanel key={tab} tab={tab} />

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
              {tab === "borrow" ? INITIAL_BORROWS.length : INITIAL_RETURNS.length} records
            </span>
          </div>
          <div
            className="rounded border border-ink-200 bg-white p-4"
            style={{ boxShadow: "var(--shadow)" }}
          >
            <TransactionsTable
              tab={tab}
              records={tab === "borrow" ? INITIAL_BORROWS : INITIAL_RETURNS}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
