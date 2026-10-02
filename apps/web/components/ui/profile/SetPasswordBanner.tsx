// components/ui/profile/SetPasswordBanner.tsx
// Dashboard-only, dismissible nudge for a Google-only account (no password
// set — see routers/auth.py's GET /auth/password-status) to add one, so
// manual login works for them too (kiosk included). Deliberately NOT part
// of CompleteProfileModal — that one blocks on required fields; this is
// optional, so it reads as a suggestion, not a second thing to fill in
// before the dashboard shows. Dismissing hides it for good on this device
// (localStorage) — the student can still always reach Settings by hand if
// they change their mind, same place this links to.
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { KeyRound, X } from "lucide-react"
import { fetchPasswordStatus } from "@/lib/auth"

const DISMISS_KEY = "password-banner-dismissed"

export function SetPasswordBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") return
    fetchPasswordStatus()
      .then((res) => { if (!res.has_password) setVisible(true) })
      .catch(() => {}) // fail silent — a nudge, not core page content
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="flex items-start sm:items-center gap-3 rounded-(--radius) border border-green-200 bg-green-50 px-4 py-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 shrink-0">
        <KeyRound size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ink-900 font-medium" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          Add a password to your account
        </p>
        <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
          You&apos;re signed in with Google. Set a password too so you can also log in at the library kiosk.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
        <Link
          href="/student/profile?tab=settings"
          className="px-3 py-1.5 rounded-(--radius-sm) bg-green-700 text-white font-medium hover:bg-green-800 transition-colors whitespace-nowrap"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
        >
          Set up
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex items-center justify-center w-7 h-7 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
