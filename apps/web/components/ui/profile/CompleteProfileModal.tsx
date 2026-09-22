// components/ui/profile/CompleteProfileModal.tsx
// Shown once to a student whose program or year level is still empty — e.g.
// someone who signed in with Google but wasn't in the librarian's card
// enrollment spreadsheet, so no account was pre-filled for them. Saves via
// PATCH /auth/me; never asks for a card (only a librarian assigns those).
"use client"

import { useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { updateAcademicProfile } from "@/lib/auth"
import { COLLEGES } from "@/lib/colleges"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { cn } from "@/lib/utils"

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6]

const fieldClass = cn(
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-ink-900 placeholder:text-ink-300",
  "focus:outline-none focus:border-green-700 focus:shadow-(--shadow-focus-green)"
)

export function CompleteProfileModal({ role, onDone }: { role: "student" | "faculty"; onDone: () => void }) {
  const isFaculty = role === "faculty"

  const [program, setProgram] = useState("")
  const [college, setCollege] = useState("")
  const [yearLevel, setYearLevel] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Suggest a college from the program as they type, until they pick one.
  // Faculty have no program field to guess from — they pick their college
  // directly (see routers/patrons.py: a faculty row's "program" column
  // holds a college name, not a degree program, same as the mock data).
  const suggested = isFaculty ? null : collegeForProgram(program)
  const effectiveCollege = college || suggested || ""

  const canSubmit = isFaculty ? !!effectiveCollege : !!program.trim() && !!yearLevel

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      await updateAcademicProfile(
        isFaculty
          ? { college: effectiveCollege }
          : { program: program.trim(), year_level: Number(yearLevel), college: effectiveCollege || null }
      )
      onDone()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save your details")
      setSaving(false)
    }
  }

  const labelStyle = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="complete-profile-title">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        <h2 id="complete-profile-title" className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
          Finish setting up
        </h2>
        <p className="mt-1 text-ink-400" style={labelStyle}>
          {isFaculty
            ? "Tell us your college so we can recommend the right books. You only do this once."
            : "Tell us your program and year level so we can recommend the right books. You only do this once."}
        </p>

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

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 font-semibold text-white transition-colors hover:bg-green-800 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
          style={labelStyle}
        >
          {saving && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />}
          {saving ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  )
}
