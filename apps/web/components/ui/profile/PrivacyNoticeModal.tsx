// First-login privacy notice. Can't be closed: Accept or Decline (signs out).
//
// DRAFT: the text (lib/privacyNotice.ts) and ACCEPT_LABEL aren't yet
// reviewed by DLSL's Data Protection Officer. Once approved, change
// PRIVACY_NOTICE_VERSION in apps/api/routers/auth.py.
"use client"

import { useRef, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { acceptPrivacyNotice, clearSession } from "@/lib/auth"
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'
import { NOTICE_CLOSING, NOTICE_INTRO, NOTICE_SECTIONS } from "@/lib/privacyNotice"

const ACCEPT_LABEL = "I have read and understood this Data Privacy Notice, and I consent to the processing of my personal data as described."

export function PrivacyNoticeModal({ step, onDone }: { step?: { current: number; total: number }; onDone: () => void }) {
  const dialogRef = useRef<HTMLFormElement>(null)
  useDialogKeyboard(dialogRef)
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed) return
    setError("")
    setSaving(true)
    try {
      await acceptPrivacyNotice()
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not record your acceptance")
      setSaving(false)
    }
  }

  // For now, declining signs the user out. Not a final decision.
  function handleDecline() {
    clearSession()
    window.location.replace("/login")
  }

  const labelStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center bg-black/55 p-4" style={{ top: "var(--height-nav)" }} role="dialog" aria-modal="true" aria-labelledby="privacy-notice-title">
      <form ref={dialogRef} onSubmit={handleAccept} className="flex max-h-full w-full max-w-2xl flex-col rounded-3xl bg-white p-6 sm:p-8" style={{ boxShadow: "var(--shadow-lg)" }}>
        {step && step.total > 1 && (
          <p className="mb-1 font-semibold text-green-700 uppercase" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-section)" }}>
            Step {step.current} of {step.total}
          </p>
        )}
        <h2 id="privacy-notice-title" className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
          Data Privacy Notice
        </h2>

        {/* Scrolls on its own so a long official notice never pushes the buttons off-screen. */}
        <div tabIndex={0} className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-ink-200 bg-paper p-4 text-ink-700" style={labelStyle}>
          <p>{NOTICE_INTRO}</p>
          {NOTICE_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h3 className="font-semibold text-ink-900">{section.heading}</h3>
              <p className="mt-1">{section.body}</p>
              {section.items && (
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
          <p>{NOTICE_CLOSING}</p>
        </div>

        <label className="mt-4 flex items-start gap-2.5 text-ink-900" style={labelStyle}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-green-700" />
          <span>{ACCEPT_LABEL}</span>
        </label>

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !agreed}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 font-semibold text-white transition-colors hover:bg-green-800 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
          style={labelStyle}
        >
          {saving && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />}
          {saving ? "Saving…" : "Accept and continue"}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={saving}
          className="mt-2 w-full rounded-xl py-2 font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-60"
          style={labelStyle}
        >
          Decline and sign out
        </button>
      </form>
    </div>
  )
}
