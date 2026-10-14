// apps/web/app/librarian/inventory/[sessionId]/page.tsx
// One inventory check. While it's open: the scan screen (USB scanner or
// webcam), live counts and the copies still to scan. Once finished: the
// results grouped Not Found / Misplaced / Found, with one-click Mark
// Missing / Mark Found on every copy that needs a follow-up.

"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Loader2,
  MapPinOff,
  ScanLine,
  Usb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ScannerListener } from "@/components/ui/ScannerListener"
import { CameraScanner } from "@/components/ui/CameraScanner"
import {
  cancelInventorySession,
  completeInventorySession,
  fetchInventorySession,
  formatWhen,
  resolveInventoryItem,
  scanInventoryCode,
  type InventoryItem,
  type InventorySession,
  type InventorySessionDetail,
  type ScanOutcome,
  type ScanResult,
} from "@/lib/inventory"

const body = (size = "var(--text-sm-body)") => ({ fontFamily: "var(--font-body)", fontSize: size })
const RECENT_SCANS_SHOWN = 12

const OUTCOME_STYLE: Record<ScanOutcome, { box: string; icon: React.ReactNode }> = {
  found:           { box: "border-green-200 bg-green-50 text-green-800",   icon: <CheckCircle2 size={18} className="shrink-0" /> },
  misplaced:       { box: "border-[#FBCFE8] bg-[#FCE7F3] text-[#9D174D]", icon: <MapPinOff size={18} className="shrink-0" /> },
  already_scanned: { box: "border-ink-200 bg-ink-50 text-ink-700",         icon: <CheckCircle2 size={18} className="shrink-0" /> },
  on_loan:         { box: "border-gold-500/40 bg-gold-100 text-ink-800",   icon: <AlertTriangle size={18} className="shrink-0" /> },
  reserved:        { box: "border-gold-500/40 bg-gold-100 text-ink-800",   icon: <AlertTriangle size={18} className="shrink-0" /> },
  damaged:         { box: "border-gold-500/40 bg-gold-100 text-ink-800",   icon: <AlertTriangle size={18} className="shrink-0" /> },
  unknown:         { box: "border-red-200 bg-red-50 text-danger",          icon: <HelpCircle size={18} className="shrink-0" /> },
}

// A short tone per result, so a librarian walking the shelf doesn't have to
// look at the screen after every scan. Best-effort: silent if the browser
// blocks audio.
function beep(outcome: ScanOutcome) {
  try {
    const ctx = new AudioContext()
    const tones = outcome === "found" ? [880] : outcome === "misplaced" ? [660, 440] : outcome === "already_scanned" ? [880, 880] : [220]
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.value = 0.08
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.14)
      osc.stop(ctx.currentTime + i * 0.14 + 0.11)
    })
    setTimeout(() => ctx.close(), 600)
  } catch {
    /* no audio — the colored banner still shows the result */
  }
}

function upsertItem(items: InventoryItem[], item: InventoryItem): InventoryItem[] {
  const i = items.findIndex((x) => x.id === item.id)
  if (i === -1) return [...items, item]
  const next = [...items]
  next[i] = item
  return next
}

export default function InventorySessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [detail, setDetail] = useState<InventorySessionDetail | null>(null)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    fetchInventorySession(sessionId)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load this check"))
  }, [sessionId])

  if (loadError) {
    return (
      <div className="px-4 py-5 sm:p-6 flex flex-col gap-4">
        <BackLink />
        <div className="flex items-center gap-2 rounded-(--radius) border border-red-200 bg-red-50 px-4 py-3 text-danger" style={body()}>
          <AlertCircle size={16} className="shrink-0" /> {loadError}
        </div>
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="px-4 py-5 sm:p-6 flex items-center gap-2 text-ink-400" style={body()}>
        <Loader2 size={16} className="animate-spin" /> Loading check…
      </div>
    )
  }

  return detail.status === "in_progress"
    ? <ScanView detail={detail} setDetail={setDetail} />
    : <ResultsView detail={detail} setDetail={setDetail} />
}

function BackLink() {
  return (
    <Link href="/librarian/inventory" className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-900 w-fit" style={body()}>
      <ArrowLeft size={15} /> Inventory
    </Link>
  )
}

function Header({ session, subtitle }: { session: InventorySession; subtitle: string }) {
  return (
    <div className="flex flex-col gap-2">
      <BackLink />
      <h1 className="text-ink-900 font-semibold leading-tight" style={{ fontSize: "var(--text-4xl)", fontFamily: "var(--font-display)" }}>
        {session.label}
      </h1>
      <p className="text-ink-500" style={body()}>
        {subtitle} · started {formatWhen(session.started_at)}
        {session.started_by_name && ` by ${session.started_by_name}`}
      </p>
    </div>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 px-4 py-3 min-w-0">
      <p className="text-ink-400 font-semibold uppercase truncate" style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}>
        {label}
      </p>
      <p className={cn("font-bold leading-tight mt-1", tone)} style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
        {value}
      </p>
    </div>
  )
}

function CopyLine({ item, extra }: { item: InventoryItem; extra?: React.ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-ink-900 font-medium truncate" style={body()}>{item.title ?? "Unknown title"}</span>
      <span className="block text-ink-400" style={body("var(--text-xs)")}>
        <span style={{ fontFamily: "var(--font-mono)" }}>{item.accession_number}</span>
        {item.call_number && ` · ${item.call_number}`}
        {extra}
      </span>
    </span>
  )
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

function ScanView({ detail, setDetail }: { detail: InventorySessionDetail; setDetail: (d: InventorySessionDetail) => void }) {
  const [mode, setMode] = useState<"usb" | "camera">("usb")
  const [manual, setManual] = useState("")
  const [recent, setRecent] = useState<ScanResult[]>([])
  const [busy, setBusy] = useState(false)
  const [scanError, setScanError] = useState("")
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [showLeft, setShowLeft] = useState(false)

  // A USB scanner can fire faster than the API answers — run scans one at
  // a time, in order, so counts never race each other.
  const queue = useRef(Promise.resolve())
  const detailRef = useRef(detail)
  useEffect(() => { detailRef.current = detail }, [detail])

  function handleScan(raw: string) {
    const code = raw.trim()
    if (!code) return
    queue.current = queue.current.then(async () => {
      setBusy(true)
      setScanError("")
      try {
        const result = await scanInventoryCode(detail.id, code)
        beep(result.outcome)
        setRecent((r) => [result, ...r].slice(0, RECENT_SCANS_SHOWN))
        const current = detailRef.current
        const next = {
          ...current,
          ...result.session,
          items: result.item ? upsertItem(current.items, result.item) : current.items,
        }
        detailRef.current = next
        setDetail(next)
      } catch (e) {
        beep("unknown")
        setScanError(e instanceof Error ? e.message : "Scan failed")
      } finally {
        setBusy(false)
      }
    })
  }

  async function handleFinish() {
    setFinishing(true)
    try {
      await completeInventorySession(detail.id)
      setDetail(await fetchInventorySession(detail.id))
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Could not finish the check")
      setFinishing(false)
      setConfirmFinish(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel this check? Its scans are kept but it won't count as a finished check.")) return
    try {
      await cancelInventorySession(detail.id)
      setDetail(await fetchInventorySession(detail.id))
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Could not cancel the check")
    }
  }

  const left = detail.items.filter((i) => i.result === "pending")
  const last = recent[0]
  const progress = detail.expected ? Math.round(((detail.expected - detail.pending) / detail.expected) * 100) : 100

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-6">
      <Header session={detail} subtitle="Check in progress" />

      <div className="grid grid-cols-3 gap-3">
        <Count label="Found" value={detail.found} tone="text-green-700" />
        <Count label="Misplaced" value={detail.misplaced} tone="text-[#9D174D]" />
        <Count label="Left to scan" value={detail.pending} tone="text-ink-900" />
      </div>
      <div className="h-2 rounded-full bg-ink-100 overflow-hidden" aria-label={`${progress}% scanned`}>
        <div className="h-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Scanner */}
        <section className="flex-1 min-w-0 bg-white rounded-(--radius) border border-ink-200 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-ink-900 font-semibold flex items-center gap-2" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
              <ScanLine size={18} className="text-green-700" /> Scan books
              {busy && <Loader2 size={15} className="animate-spin text-ink-400" />}
            </h2>
            <div className="inline-flex rounded-(--radius) border border-ink-200 p-0.5 bg-ink-50" role="tablist">
              {([
                ["usb", <Usb key="u" size={14} />, "USB scanner"],
                ["camera", <Camera key="c" size={14} />, "Webcam"],
              ] as const).map(([value, icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-medium transition-colors",
                    mode === value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900",
                  )}
                  style={body("var(--text-xs)")}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "camera" ? (
            <CameraScanner onScan={handleScan} />
          ) : (
            <>
              {/* Catches scans even after a click moved focus to a button. */}
              <ScannerListener onScan={handleScan} />
              <p className="text-ink-500" style={body()}>
                Scan each book&apos;s barcode sticker. You can also type an accession number and press Enter.
              </p>
            </>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); handleScan(manual); setManual("") }}
            className="flex gap-2"
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Accession number, e.g. T45312"
              autoFocus={mode === "usb"}
              autoComplete="off"
              className="flex-1 min-w-0 px-3 py-2 rounded-(--radius) border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
            />
            <button
              type="submit"
              disabled={!manual.trim()}
              className="px-4 py-2 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 disabled:opacity-50"
              style={body()}
            >
              Add
            </button>
          </form>

          {last && (
            <div className={cn("flex items-start gap-2 rounded-(--radius) border px-4 py-3", OUTCOME_STYLE[last.outcome].box)} style={body()}>
              {OUTCOME_STYLE[last.outcome].icon}
              <span className="font-medium">{last.message}</span>
            </div>
          )}
          {scanError && (
            <div className="flex items-center gap-2 rounded-(--radius) border border-red-200 bg-red-50 px-4 py-3 text-danger" style={body()}>
              <AlertCircle size={16} className="shrink-0" /> {scanError}
            </div>
          )}
        </section>

        {/* Recent scans */}
        <section className="lg:w-96 flex flex-col gap-2">
          <h3 className="text-ink-400 font-semibold uppercase" style={{ ...body("var(--text-2xs)"), letterSpacing: "var(--tracking-caps)" }}>
            Recent scans
          </h3>
          <div className="bg-white rounded-(--radius) border border-ink-200">
            {recent.length === 0 && <p className="px-4 py-6 text-center text-ink-400" style={body()}>Nothing scanned yet.</p>}
            {recent.map((r, i) => (
              <div key={i} className={cn("flex items-start gap-2 px-4 py-2.5 border-b border-ink-100 last:border-b-0", OUTCOME_STYLE[r.outcome].box, "bg-transparent border-x-0 border-t-0")} style={body("var(--text-xs)")}>
                {OUTCOME_STYLE[r.outcome].icon}
                <span>{r.message}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Still to scan */}
      <section className="bg-white rounded-(--radius) border border-ink-200">
        <button
          type="button"
          onClick={() => setShowLeft((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-ink-900 font-semibold"
          style={body()}
        >
          Not scanned yet ({left.length})
          <ChevronDown size={16} className={cn("transition-transform", showLeft && "rotate-180")} />
        </button>
        {showLeft && left.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-ink-100">
            <CopyLine item={item} />
          </div>
        ))}
      </section>

      {/* Finish */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
        {confirmFinish ? (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center rounded-(--radius) border border-gold-500/40 bg-gold-100 px-4 py-3">
            <span className="text-ink-800" style={body()}>
              {detail.pending > 0
                ? `${detail.pending} ${detail.pending === 1 ? "copy" : "copies"} not scanned will be listed as Not Found.`
                : "Every expected copy was scanned."}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                className="px-3 py-2 rounded-(--radius) border border-ink-300 bg-white text-ink-700 font-medium"
                style={body()}
              >
                Keep scanning
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishing}
                className="flex items-center gap-2 px-3 py-2 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800 disabled:opacity-50"
                style={body()}
              >
                {finishing && <Loader2 size={14} className="animate-spin" />} Finish check
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" onClick={handleCancel} className="px-4 py-2.5 rounded-(--radius) text-ink-500 hover:text-danger font-medium" style={body()}>
              Cancel check
            </button>
            <button
              type="button"
              onClick={() => setConfirmFinish(true)}
              className="px-4 py-2.5 rounded-(--radius) bg-green-700 text-white font-medium hover:bg-green-800"
              style={body()}
            >
              Finish check
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Results ──────────────────────────────────────────────────────────────────

function ResultsView({ detail, setDetail }: { detail: InventorySessionDetail; setDetail: (d: InventorySessionDetail) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [showFound, setShowFound] = useState(false)

  async function resolve(item: InventoryItem, action: "missing" | "found") {
    setBusyId(item.id)
    setError("")
    try {
      const updated = await resolveInventoryItem(item.id, action)
      setDetail({ ...detail, resolved: detail.resolved + 1, items: upsertItem(detail.items, updated) })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this copy")
    } finally {
      setBusyId(null)
    }
  }

  const notFound = detail.items.filter((i) => i.result === "not_found")
  const misplaced = detail.items.filter((i) => i.result === "misplaced")
  const found = detail.items.filter((i) => i.result === "found")

  function actions(item: InventoryItem, foundLabel: string) {
    if (item.resolution) {
      return (
        <span className="text-ink-500 shrink-0" style={body("var(--text-xs)")}>
          {item.resolution === "marked_missing" ? "Marked missing" : "Marked found — in the Reshelving Queue"}
        </span>
      )
    }
    const busy = busyId === item.id
    return (
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => resolve(item, "missing")}
          disabled={busy}
          className="px-3 py-1.5 rounded-sm border border-[#DDD6FE] text-[#6D28D9] font-semibold hover:bg-[#EDE9FE] disabled:opacity-50"
          style={body("var(--text-xs)")}
        >
          Mark Missing
        </button>
        <button
          type="button"
          onClick={() => resolve(item, "found")}
          disabled={busy}
          className="px-3 py-1.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 disabled:opacity-50"
          style={body("var(--text-xs)")}
        >
          {busy ? "Saving…" : foundLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-6">
      <Header
        session={detail}
        subtitle={detail.status === "cancelled" ? "Cancelled" : `Finished ${detail.completed_at ? formatWhen(detail.completed_at) : ""}`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Count label="Expected" value={detail.expected} tone="text-ink-900" />
        <Count label="Found" value={detail.found} tone="text-green-700" />
        <Count label="Misplaced" value={detail.misplaced} tone="text-[#9D174D]" />
        <Count label="Not found" value={detail.not_found} tone="text-[#6D28D9]" />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-(--radius) border border-red-200 bg-red-50 px-4 py-3 text-danger" style={body()}>
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      <ResultSection
        title="Not found"
        hint="Expected on this shelf but not scanned. Mark each one missing, or found if it turned up somewhere."
        items={notFound}
        empty="Every expected copy was found."
        render={(item) => (
          <>
            <CopyLine item={item} />
            {actions(item, "Mark Found")}
          </>
        )}
      />

      <ResultSection
        title="Misplaced"
        hint="Scanned here but they belong on another shelf. Once a copy is back where it belongs, mark it found."
        items={misplaced}
        empty="No misplaced copies on this shelf."
        render={(item) => (
          <>
            <CopyLine item={item} extra={<> · belongs in <span className="text-[#9D174D] font-semibold">{item.expected_location}</span></>} />
            {actions(item, "Moved back")}
          </>
        )}
      />

      <section className="bg-white rounded-(--radius) border border-ink-200">
        <button
          type="button"
          onClick={() => setShowFound((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-ink-900 font-semibold"
          style={body()}
        >
          Found ({found.length})
          <ChevronDown size={16} className={cn("transition-transform", showFound && "rotate-180")} />
        </button>
        {showFound && found.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-ink-100">
            <CheckCircle2 size={15} className="text-green-700 shrink-0" />
            <CopyLine item={item} />
          </div>
        ))}
      </section>
    </div>
  )
}

function ResultSection({
  title,
  hint,
  items,
  empty,
  render,
}: {
  title: string
  hint: string
  items: InventoryItem[]
  empty: string
  render: (item: InventoryItem) => React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          {title} <span className="text-ink-400 font-normal" style={body()}>{items.length}</span>
        </h2>
        <p className="text-ink-500" style={body("var(--text-xs)")}>{hint}</p>
      </div>
      <div className="bg-white rounded-(--radius) border border-ink-200">
        {items.length === 0 && <p className="px-4 py-6 text-center text-ink-400" style={body()}>{empty}</p>}
        {items.map((item) => (
          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 border-b border-ink-100 last:border-b-0">
            {render(item)}
          </div>
        ))}
      </div>
    </section>
  )
}
