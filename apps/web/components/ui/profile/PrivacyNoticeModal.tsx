// components/ui/profile/PrivacyNoticeModal.tsx
// First step of the first-login flow, before CompleteProfileModal /
// SetPasswordModal, for any account with no privacy_accepted_at yet. Can't
// be dismissed — no close button or backdrop click; the only ways out are
// Accept (POST /auth/accept-privacy) or Decline (signs out).
//
// NOT SHIPPABLE AS-IS: the NOTICE_* text and ACCEPT_LABEL are an unreviewed
// DRAFT template, not official or legally reviewed text. They are pending review
// by DLSL's Data Protection Officer. Keep this on a feature branch until the
// team confirms the final text; only then change PRIVACY_NOTICE_VERSION in
// routers/auth.py from "placeholder".
"use client"

import { useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { acceptPrivacyNotice, clearSession } from "@/lib/auth"

// DRAFT — pending DPO review. Intro and closing are plain paragraphs; each
// section renders as a bold heading, a paragraph, and (if present) a list.
const NOTICE_INTRO = `De La Salle Lipa – Learning Resource Center ("DLSL LRC," "we," "us") values your privacy. This notice explains how we collect, use, and protect your personal data when you use the Lasallia library system, in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and its Implementing Rules and Regulations.`

const NOTICE_SECTIONS: { heading: string; body: string; items?: string[] }[] = [
  {
    heading: "WHAT WE COLLECT",
    body: "We collect and process personal information you provide when you use this system, including but not limited to: your name, student/employee number, program, college, year level, email address, and your borrowing, reservation, and library usage history.",
  },
  {
    heading: "WHY WE COLLECT IT",
    body: "We use this information to:",
    items: [
      "Manage your library account, loans, reservations, and fines",
      "Send you notifications about your account (e.g. due dates, pickup notices)",
      "Maintain accurate library records as required by DLSL's institutional policies",
      "Improve library services and generate usage reports for institutional purposes",
    ],
  },
  {
    heading: "HOW WE PROTECT IT",
    body: "We implement reasonable organizational, physical, and technical safeguards to protect your personal data from unauthorized access, use, or disclosure.",
  },
  {
    heading: "HOW LONG WE KEEP IT",
    body: "We retain your personal data for as long as necessary to fulfill the purposes described above, or as required by DLSL policy and applicable law.",
  },
  {
    heading: "YOUR RIGHTS",
    body: "Under the Data Privacy Act, you have the right to be informed, to access your data, to correct inaccurate data, to object to processing, and to file a complaint with the National Privacy Commission. To exercise these rights or ask questions about this notice, contact the Data Protection Officer.",
  },
]

const NOTICE_CLOSING = `By clicking "Accept," you acknowledge that you have read and understood this notice and consent to the processing of your personal data as described above.`
const ACCEPT_LABEL = "I have read and understood this Data Privacy Notice, and I consent to the processing of my personal data as described."

export function PrivacyNoticeModal({ step, onDone }: { step?: { current: number; total: number }; onDone: () => void }) {
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

  // Provisional: declining signs the user out, so the account can't be used
  // without accepting. The team may want a different outcome here — this
  // isn't a final decision.
  function handleDecline() {
    clearSession()
    window.location.replace("/login")
  }

  const labelStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="privacy-notice-title">
      <form onSubmit={handleAccept} className="flex max-h-full w-full max-w-lg flex-col rounded-3xl bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
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
