// Closed dates and holidays in Settings. Any date not listed follows the
// weekly Operating Hours above. Has its own buttons, not the page's Save.

"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { closeDate, fetchClosedDates, reopenDate, type ClosedDate } from "@/lib/settings"
import { manilaToday } from "@/lib/manilaDates"
import { formatDate } from "@/lib/dueDates"

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" } as const
const small = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" } as const
const inputClass = "w-full px-3 py-2 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors focus:border-green-700 focus:ring-1 focus:ring-green-700"

export function LibraryCalendarPanel({ onDone }: { onDone: (message: string) => void }) {
  const [dates, setDates] = useState<ClosedDate[] | null>(null)
  const [day, setDay] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchClosedDates()
      .then(setDates)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the library calendar"))
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  const add = () => run(async () => {
    const saved = await closeDate(day, note)
    setDates((list) => [...(list ?? []).filter((d) => d.date !== saved.date), saved].sort((a, b) => a.date.localeCompare(b.date)))
    setDay("")
    setNote("")
    onDone("Closed date added")
  })

  const remove = (date: string) => run(async () => {
    await reopenDate(date)
    setDates((list) => (list ?? []).filter((d) => d.date !== date))
    onDone("Closed date removed")
  })

  const today = manilaToday()
  const upcoming = (dates ?? []).filter((d) => d.date >= today)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-500" style={small}>
        Mark holidays and other closed dates. They don&apos;t count as school days, so no fine builds up and no
        book falls due on them. Any date not listed here follows the Operating Hours above.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <label className="flex flex-col gap-1 text-ink-700 sm:w-44" style={small}>
          Date
          <input type="date" value={day} min={today} onChange={(e) => setDay(e.target.value)} className={inputClass} style={body} />
        </label>
        <label className="flex flex-col gap-1 text-ink-700 flex-1" style={small}>
          Reason (optional)
          <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Christmas Day" className={inputClass} style={body} />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!day || busy}
          className="px-4 py-2 rounded-(--radius) font-medium transition-colors bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
          style={body}
        >
          Mark closed
        </button>
      </div>

      {error && <p className="text-red-600" style={small} role="alert">{error}</p>}

      {dates !== null && upcoming.length === 0 && (
        <p className="text-ink-400" style={small}>No upcoming closed dates.</p>
      )}
      {upcoming.length > 0 && (
        <ul className="flex flex-col divide-y divide-ink-100 rounded-sm border border-ink-200">
          {upcoming.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 text-ink-900" style={body}>
                {formatDate(`${d.date}T12:00:00+08:00`)}
                {d.note && <span className="text-ink-400"> · {d.note}</span>}
              </span>
              <button
                type="button"
                onClick={() => remove(d.date)}
                disabled={busy}
                aria-label={`Remove ${d.date}`}
                className="flex items-center justify-center w-7 h-7 rounded-full text-ink-400 hover:bg-ink-100 hover:text-red-600 transition-colors shrink-0 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
