// components/ui/profile/SetPasswordModal.tsx
// Second step of the first-login flow (after CompleteProfileModal) for a
// Google-only account that has no password yet (GET /auth/password-status).
// Kept as its own modal instead of more fields under CompleteProfileModal so
// neither screen gets too long. "Skip for now" is remembered for this
// browser session only (sessionStorage), so it asks again on the next login;
// SetPasswordBanner on the dashboard still reminds them until they set one
// or dismiss that too.
"use client"

import { useState } from "react"
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { setPassword } from "@/lib/auth"
import { cn } from "@/lib/utils"

export const PASSWORD_PROMPT_SKIP_KEY = "password-prompt-skipped"
// Lets an already-mounted SetPasswordBanner hide itself once this succeeds.
export const PASSWORD_SET_EVENT = "lasallia:password-set"

const MIN_PASSWORD_LENGTH = 8

const fieldClass = cn(
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-ink-900 placeholder:text-ink-300",
  "focus:outline-none focus:border-green-700 focus:shadow-(--shadow-focus-green)"
)

export function SetPasswordModal({ step, onDone }: { step?: { current: number; total: number }; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const validationError =
    newPassword.length < MIN_PASSWORD_LENGTH
      ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      : newPassword !== confirmPassword
        ? "Passwords don't match."
        : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validationError) {
      setError(validationError)
      return
    }
    setError("")
    setSaving(true)
    try {
      await setPassword(newPassword)
      // Same key as "Skip for now" — so a refresh right after never re-asks
      // even if password-status is slow to reflect the change.
      try { sessionStorage.setItem(PASSWORD_PROMPT_SKIP_KEY, "true") } catch {}
      window.dispatchEvent(new Event(PASSWORD_SET_EVENT))
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not set your password")
      setSaving(false)
    }
  }

  function handleSkip() {
    try { sessionStorage.setItem(PASSWORD_PROMPT_SKIP_KEY, "true") } catch {}
    onDone()
  }

  const labelStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="set-password-title">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        {step && step.total > 1 && (
          <p className="mb-1 font-semibold text-green-700 uppercase" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}>
            Step {step.current} of {step.total}
          </p>
        )}
        <h2 id="set-password-title" className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
          Set a password
        </h2>
        <p className="mt-1 text-ink-400" style={labelStyle}>
          You signed in with Google. Add a password so you can also log in at the library kiosk.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="sp-new" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>Password</label>
            <div className="relative">
              <input
                id="sp-new"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                className={cn(fieldClass, "pr-10")}
                style={labelStyle}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="sp-confirm" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>Confirm password</label>
            <div className="relative">
              <input
                id="sp-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className={cn(fieldClass, "pr-10")}
                style={labelStyle}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !newPassword || !confirmPassword}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 font-semibold text-white transition-colors hover:bg-green-800 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
          style={labelStyle}
        >
          {saving && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />}
          {saving ? "Saving…" : "Set password"}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="mt-2 w-full rounded-xl py-2 font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-60"
          style={labelStyle}
        >
          Skip for now
        </button>
      </form>
    </div>
  )
}
