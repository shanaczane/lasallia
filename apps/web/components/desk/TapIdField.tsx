// "Tap the borrower's ID" at the desk. The ID reader types the card's id
// and presses Enter, like a keyboard, so this is a focused input.

"use client"

import { useState } from "react"
import { IdCard } from "lucide-react"
import { cn } from "@/lib/utils"

export function TapIdField({
  onTap,
  busy = false,
  error,
  label = "Tap the borrower's ID",
  autoFocus = true,
}: {
  onTap: (uid: string) => void
  busy?: boolean
  error?: string
  label?: string
  autoFocus?: boolean
}) {
  const [value, setValue] = useState("")

  function submit() {
    const uid = value.trim()
    if (!uid || busy) return
    setValue("")
    onTap(uid)
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="desk-tap-id" className="text-ink-700 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IdCard size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            id="desk-tap-id"
            type="text"
            placeholder="Tap the ID on the reader…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus={autoFocus}
            autoComplete="off"
            className="w-full pl-8 pr-3 py-2 rounded border border-ink-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || busy}
          className={cn(
            "px-4 py-2 rounded font-semibold transition-colors",
            value.trim() && !busy ? "bg-green-700 text-white hover:bg-green-800" : "bg-ink-200 text-ink-400 cursor-not-allowed"
          )}
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {busy ? "Reading…" : "Identify"}
        </button>
      </div>
      {error && (
        <p className="text-red-600" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}>
          {error}
        </p>
      )}
    </div>
  )
}
