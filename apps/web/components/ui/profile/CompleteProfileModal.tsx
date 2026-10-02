// components/ui/profile/CompleteProfileModal.tsx
// Shown once to a student/faculty account that needs either (or both) of:
//   - academic fields filled in (program/year level, or college for
//     faculty) — e.g. signed in with Google but wasn't in the librarian's
//     card enrollment spreadsheet, so no account was pre-filled for them.
//   - a password set — a Google sign-in never has one, which is the only
//     thing standing between that account and the kiosk's manual login
//     (or the website's own manual login) ever working for them. This part
//     is optional/skippable — unlike the academic fields, nobody is
//     blocked from using the site without a password, they just can't use
//     manual login anywhere until they set one.
// Saves via PATCH /auth/me and POST /auth/set-password; never asks for an
// RFID card (only a librarian assigns those).
"use client"

import { useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { updateAcademicProfile, setPassword as savePassword } from "@/lib/auth"
import { COLLEGES } from "@/lib/colleges"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { cn } from "@/lib/utils"

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6]
const MIN_PASSWORD_LENGTH = 8

const fieldClass = cn(
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-ink-900 placeholder:text-ink-300",
  "focus:outline-none focus:border-green-700 focus:shadow-(--shadow-focus-green)"
)

export function CompleteProfileModal({
  role,
  needsProfile,
  needsPassword,
  onDone,
}: {
  role: "student" | "faculty"
  needsProfile: boolean
  needsPassword: boolean
  onDone: () => void
}) {
  const isFaculty = role === "faculty"

  const [program, setProgram] = useState("")
  const [college, setCollege] = useState("")
  const [yearLevel, setYearLevel] = useState("")
  const [password, setPasswordField] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [skipPassword, setSkipPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Suggest a college from the program as they type, until they pick one.
  // Faculty have no program field to guess from — they pick their college
  // directly (see routers/patrons.py: a faculty row's "program" column
  // holds a college name, not a degree program, same as the mock data).
  const suggested = isFaculty ? null : collegeForProgram(program)
  const effectiveCollege = college || suggested || ""

  const canSubmitProfile = !needsProfile || (isFaculty ? !!effectiveCollege : !!program.trim() && !!yearLevel)

  const wantsPassword = needsPassword && !skipPassword && (password !== "" || confirmPassword !== "")
  const passwordError =
    !wantsPassword ? null
    : password.length < MIN_PASSWORD_LENGTH ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    : password !== confirmPassword ? "Passwords don't match."
    : null

  const canSubmit = canSubmitProfile && !passwordError

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      if (needsProfile) {
        await updateAcademicProfile(
          isFaculty
            ? { college: effectiveCollege }
            : { program: program.trim(), year_level: Number(yearLevel), college: effectiveCollege || null }
        )
      }
      if (wantsPassword) {
        await savePassword(password)
      }
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save your details")
      setSaving(false)
    }
  }

  const labelStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }
  const smallStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }

  // Button copy reflects what this click will actually do — "Continue"
  // when there's nothing required left (profile already complete, and
  // either no password typed or already skipped), vs naming the password
  // step when it's genuinely about to be set.
  const submitLabel = saving
    ? "Saving…"
    : !needsProfile && !wantsPassword ? "Continue"
    : wantsPassword && !needsProfile ? "Set password and continue"
    : "Save and continue"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="complete-profile-title">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h2 id="complete-profile-title" className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
          {needsProfile ? "Finish setting up" : "Secure your account"}
        </h2>
        <p className="mt-1 text-ink-400" style={labelStyle}>
          {needsProfile
            ? isFaculty
              ? "Tell us your college so we can recommend the right books. You only do this once."
              : "Tell us your program and year level so we can recommend the right books. You only do this once."
            : "You're signed in with Google. Set a password too, so you can also log in at the library kiosk."}
        </p>

        {needsProfile && (
          <div className="mt-4 flex flex-col gap-3">
            {!isFaculty && (
              <div>
                <label htmlFor="cp-program" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>Program</label>
                <input
                  id="cp-program"
                  required
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  placeholder="e.g. BS Computer Science"
                  className={fieldClass}
                  style={labelStyle}
                />
              </div>
            )}

            <div>
              <label htmlFor="cp-college" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>College</label>
              <select
                id="cp-college"
                required={isFaculty}
                value={effectiveCollege}
                onChange={(e) => setCollege(e.target.value)}
                className={fieldClass}
                style={labelStyle}
              >
                <option value="">Select your college</option>
                {COLLEGES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {!isFaculty && (
              <div>
                <label htmlFor="cp-year" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>Year level</label>
                <select
                  id="cp-year"
                  required
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value)}
                  className={fieldClass}
                  style={labelStyle}
                >
                  <option value="">Select your year</option>
                  {YEAR_LEVELS.map((y) => <option key={y} value={y}>{y}{y === 1 ? "st" : y === 2 ? "nd" : y === 3 ? "rd" : "th"} year</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {needsPassword && !skipPassword && (
          <div className={cn("flex flex-col gap-3", needsProfile ? "mt-4 pt-4 border-t border-ink-100" : "mt-4")}>
            {needsProfile && (
              <div>
                <p className="font-semibold text-ink-900" style={labelStyle}>
                  Set a password <span className="font-normal text-ink-400">(optional)</span>
                </p>
                <p className="mt-0.5 text-ink-400" style={smallStyle}>
                  Lets you also sign in at the kiosk, or anywhere Google sign-in isn&apos;t available.
                </p>
              </div>
            )}
            <div>
              <label htmlFor="cp-password" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>Password</label>
              <input
                id="cp-password"
                type="password"
                value={password}
                onChange={(e) => setPasswordField(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                className={fieldClass}
                style={labelStyle}
              />
            </div>
            <div>
              <label htmlFor="cp-confirm-password" className="mb-1 block font-semibold text-ink-900" style={labelStyle}>Confirm password</label>
              <input
                id="cp-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className={fieldClass}
                style={labelStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => { setSkipPassword(true); setPasswordField(""); setConfirmPassword("") }}
              className="self-start text-ink-400 hover:text-ink-700 underline transition-colors"
              style={smallStyle}
            >
              Skip for now
            </button>
          </div>
        )}

        {(error || passwordError) && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-danger" style={smallStyle}>
            <AlertCircle size={14} className="shrink-0" />
            {error || passwordError}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 font-semibold text-white transition-colors hover:bg-green-800 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
          style={labelStyle}
        >
          {saving && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />}
          {submitLabel}
        </button>
      </form>
    </div>
  )
}
