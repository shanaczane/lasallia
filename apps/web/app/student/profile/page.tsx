// apps/web/app/student/profile/page.tsx
// Profile / Settings — reached from the TopNav avatar dropdown (not the
// sidebar, since this is account-level, not a primary destination).
// One page, two tabs (?tab=settings deep-links straight to Settings, same
// convention routers/loans.py already uses for notification links like
// /librarian/borrow-return?tab=reshelving) — mirrors every other
// multi-view surface in this app (librarian/settings, My Library,
// Reservations, PatronProfileModal), none of which split closely-related
// sub-views into separate routes.
//
// Settings' Full Name + Change Password reuse the exact same self-service
// endpoints (PATCH /auth/me, POST /auth/change-password) the librarian's
// own Account tab already uses — both are already role-agnostic, so
// nothing new was needed on the API side.

"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, ChevronDown } from "lucide-react"
import { cn, ordinal } from "@/lib/utils"
import { getUser, updateProfile, changePassword, type UserProfile as AuthUser } from "@/lib/auth"
import { fetchLoans, type Loan as ApiLoan } from "@/lib/kiosk"
import { collegeForProgram } from "@/lib/collegeForProgram"

const MIN_PASSWORD_LENGTH = 8

type TabKey = "profile" | "settings"

const TABS: { key: TabKey; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "settings", label: "Settings" },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

// Fine summary — same shape as PatronProfileModal's fineEntries/
// outstandingFines (librarian's Patrons screen), just against the
// signed-in student's own loans instead of a patron they're looking up,
// and without that view's librarian-facing condition/reason breakdown.
type FineKind = "unsettled" | "accruing" | "paid"

type FineEntry = {
  loanId: string
  title: string
  amount: number
  kind: FineKind
  detail: string
  // Longer explanation of why this fine exists, shown when the row is
  // expanded — the collapsed `detail` line stays terse.
  reason: string
}

const FINE_CFG: Record<FineKind, { label: string; text: string; bg: string }> = {
  unsettled: { label: "Unsettled", text: "text-danger", bg: "bg-danger-bg" },
  accruing:  { label: "Accruing",  text: "text-warn",   bg: "bg-warn-bg" },
  paid:      { label: "Paid",      text: "text-success", bg: "bg-success-bg" },
}

export default function StudentProfilePage() {
  return (
    <Suspense fallback={null}>
      <StudentProfileContent />
    </Suspense>
  )
}

function StudentProfileContent() {
  const searchParams = useSearchParams()
  const initialTab: TabKey = searchParams.get("tab") === "settings" ? "settings" : "profile"
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [fullName, setFullName] = useState("")
  useEffect(() => {
    // getUser() only reads localStorage — still deferred a tick so it
    // doesn't run during Next's SSR pass of this client component. Both
    // set together (not fullName via a second effect keyed on profile) —
    // same shape as librarian/settings/page.tsx's identical Account-tab
    // bootstrap, and avoids a setState-in-effect chained off state that
    // was itself just set in an effect.
    Promise.resolve().then(() => {
      const u = getUser()
      setProfile(u)
      setFullName(u?.full_name ?? "")
    })
  }, [])

  // Own loans only — fetchLoans() with no id/studentId argument. There is
  // no way to pass another student's id in from this page, and even if
  // there were, the API's RLS policy (0009) scopes GET /loans to the
  // caller's own rows for anyone who isn't a librarian — the JWT sent in
  // the Authorization header (getToken(), inside fetchLoans) is what
  // decides whose rows come back, not anything this component controls.
  const [loans, setLoans] = useState<ApiLoan[]>([])
  const [loansLoading, setLoansLoading] = useState(true)
  useEffect(() => {
    fetchLoans()
      .then(setLoans)
      .catch(() => {})
      .finally(() => setLoansLoading(false))
  }, [])

  const fineEntries = useMemo<FineEntry[]>(() => {
    const entries: FineEntry[] = []
    for (const l of loans) {
      const title = l.books?.title ?? "Unknown title"
      if (l.status === "returned" && (l.fine_amount ?? 0) > 0) {
        const daysLate = l.returned_at
          ? Math.max(0, Math.round((new Date(l.returned_at).getTime() - new Date(l.due_date).getTime()) / 86_400_000))
          : 0
        entries.push({
          loanId: l.id,
          title,
          amount: l.fine_amount!,
          kind: l.fine_status === "paid" ? "paid" : "unsettled",
          detail: l.returned_at ? `Returned ${formatDate(l.returned_at)}` : "Returned",
          reason: `"${title}" was due ${formatDate(l.due_date)} and came back ${daysLate} day${daysLate === 1 ? "" : "s"} late.`,
        })
      } else if ((l.status === "active" || l.status === "overdue") && (l.preview_fine_amount ?? 0) > 0) {
        const days = l.days_overdue ?? 0
        entries.push({
          loanId: l.id,
          title,
          amount: l.preview_fine_amount!,
          kind: "accruing",
          detail: `${days} day${days === 1 ? "" : "s"} overdue · not yet returned`,
          reason: `"${title}" was due ${formatDate(l.due_date)} and still hasn't been returned — ${days} day${days === 1 ? "" : "s"} overdue so far. This fine keeps growing until the book comes back.`,
        })
      }
    }
    return entries
  }, [loans])

  const outstandingFines = useMemo(
    () => fineEntries.filter((e) => e.kind !== "paid").reduce((sum, e) => sum + e.amount, 0),
    [fineEntries]
  )

  // Which fine rows have their "why" explanation expanded — a set rather
  // than a single id, so more than one can be open at once.
  const [expandedFines, setExpandedFines] = useState<Set<string>>(new Set())
  function toggleFine(loanId: string) {
    setExpandedFines((prev) => {
      const next = new Set(prev)
      if (next.has(loanId)) next.delete(loanId)
      else next.add(loanId)
      return next
    })
  }

  // Settings tab — Full Name
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState("")
  const [nameSaved, setNameSaved] = useState(false)

  async function handleSaveName() {
    if (!fullName.trim()) {
      setNameError("Full Name can't be empty.")
      return
    }
    setNameSaving(true)
    setNameError("")
    setNameSaved(false)
    try {
      const updated = await updateProfile(fullName.trim())
      setProfile(updated)
      setFullName(updated.full_name ?? "")
      setNameSaved(true)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Could not update your profile")
    } finally {
      setNameSaving(false)
    }
  }

  // Settings tab — Change Password
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [passwordChanged, setPasswordChanged] = useState(false)

  const passwordValidationError =
    !currentPassword && !newPassword && !confirmPassword
      ? null
      : !currentPassword
        ? "Enter your current password."
        : newPassword.length < MIN_PASSWORD_LENGTH
          ? `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
          : newPassword !== confirmPassword
            ? "New password and confirmation don't match."
            : newPassword === currentPassword
              ? "New password must be different from your current password."
              : null

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all three password fields.")
      return
    }
    if (passwordValidationError) {
      setPasswordError(passwordValidationError)
      return
    }
    setPasswordSaving(true)
    setPasswordError("")
    setPasswordChanged(false)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordChanged(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not change your password")
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-5 sm:px-8 sm:py-6">

      {/* Header */}
      <div>
        <h1
          className="text-ink-900 font-semibold leading-tight"
          style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}
        >
          {activeTab === "profile" ? "Profile" : "Settings"}
        </h1>
        <p
          className="text-ink-500 mt-1"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {activeTab === "profile"
            ? "Your account information and any outstanding fines"
            : "Update your name or change your password"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ink-200">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2.5 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                isActive
                  ? "border-green-700 text-green-700"
                  : "border-transparent text-ink-500 hover:text-ink-900"
              )}
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex flex-col gap-4 max-w-2xl">
        {activeTab === "profile" ? (
          !profile ? (
            <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              Couldn&apos;t find your signed-in session — try reloading the page.
            </p>
          ) : (
            <>
              <SettingsSection title="Account Information">
                <Field label="Full Name" value={profile.full_name ?? "No name on file"} onChange={() => {}} disabled />
                <Field label="Email" value={profile.email} onChange={() => {}} type="email" disabled />
                <Field
                  label="Role"
                  value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                  onChange={() => {}}
                  disabled
                />
                {/* Program/College/Year Level — same fields the librarian's
                    Patron Record shows about this same account (see
                    PatronProfileModal.tsx), read-only here since this is
                    enrollment data, not something a student edits. */}
                {profile.role === "student" ? (
                  <>
                    {profile.program && <Field label="Program" value={profile.program} onChange={() => {}} disabled />}
                    {(profile.college || collegeForProgram(profile.program)) && (
                      <Field label="College" value={(profile.college || collegeForProgram(profile.program))!} onChange={() => {}} disabled />
                    )}
                    {profile.year_level != null && (
                      <Field label="Year Level" value={`${ordinal(profile.year_level)} Year`} onChange={() => {}} disabled />
                    )}
                  </>
                ) : (
                  (profile.college || collegeForProgram(profile.program)) && (
                    <Field label="College" value={(profile.college || collegeForProgram(profile.program))!} onChange={() => {}} disabled />
                  )
                )}
              </SettingsSection>

              <SettingsSection title="Outstanding Fines">
                {loansLoading ? (
                  <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                    Loading…
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-ink-500" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                        Total owed
                      </p>
                      <p
                        className={cn("font-semibold", outstandingFines > 0 ? "text-danger" : "text-ink-900")}
                        style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-lg)" }}
                      >
                        ₱{outstandingFines.toFixed(2)}
                      </p>
                    </div>

                    {fineEntries.length === 0 ? (
                      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                        No fines on record.
                      </p>
                    ) : (
                      <div className="flex flex-col divide-y divide-ink-100 border-t border-ink-100 -mx-4">
                        {fineEntries.map((e) => {
                          const cfg = FINE_CFG[e.kind]
                          const isOpen = expandedFines.has(e.loanId)
                          return (
                            <div key={e.loanId}>
                              <button
                                type="button"
                                onClick={() => toggleFine(e.loanId)}
                                aria-expanded={isOpen}
                                className="flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap py-3 px-4 w-full text-left hover:bg-ink-50 focus-visible:outline-none focus-visible:bg-ink-50 transition-colors"
                              >
                                <div className="min-w-0 max-w-full">
                                  <p className="text-ink-900 font-medium truncate" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                                    {e.title}
                                  </p>
                                  <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                                    {e.detail}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                                  <span
                                    className={cn("px-2 py-0.5 rounded-full font-medium", cfg.bg, cfg.text)}
                                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)" }}
                                  >
                                    {cfg.label}
                                  </span>
                                  <span className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                                    ₱{e.amount.toFixed(2)}
                                  </span>
                                  <ChevronDown
                                    size={16}
                                    className={cn("shrink-0 text-ink-400 transition-transform duration-200", isOpen && "rotate-180")}
                                  />
                                </div>
                              </button>
                              {isOpen && (
                                <div className="mx-4 mb-3 px-3 py-2.5 rounded-(--radius-sm) bg-ink-50">
                                  <p
                                    className="text-ink-600"
                                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                                  >
                                    {e.reason}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {outstandingFines > 0 && (
                      <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                        Fines are settled in person at the circulation desk — this page is a summary, not a payment method.
                      </p>
                    )}
                  </>
                )}
              </SettingsSection>
            </>
          )
        ) : (
          <>
            <SettingsSection title="Full Name">
              <Field label="Full Name" value={fullName} onChange={setFullName} />

              {nameError && (
                <p className="flex items-start gap-1.5 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {nameError}
                </p>
              )}
              {nameSaved && !nameError && (
                <p className="text-success" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                  Profile updated.
                </p>
              )}

              <button
                type="button"
                onClick={handleSaveName}
                disabled={nameSaving || !fullName.trim()}
                className="self-start px-4 py-2 rounded-(--radius) font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-700 text-white hover:bg-green-800"
                style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
              >
                {nameSaving ? "Saving…" : "Save changes"}
              </button>
            </SettingsSection>

            <SettingsSection title="Change Password">
              <Field
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
                type="password"
                placeholder="Enter current password"
              />
              <Field
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                type="password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
              <Field
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                type="password"
                placeholder="Confirm new password"
              />

              {passwordError && (
                <p className="flex items-start gap-1.5 text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {passwordError}
                </p>
              )}
              {passwordChanged && !passwordError && (
                <p className="text-success" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                  Password updated.
                </p>
              )}

              <button
                type="button"
                onClick={handleChangePassword}
                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                className="self-start px-4 py-2 rounded-(--radius) font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-ink-900 text-white hover:bg-ink-700"
                style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
              >
                {passwordSaving ? "Updating…" : "Update Password"}
              </button>
            </SettingsSection>
          </>
        )}
      </div>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100">
        <p
          className="text-ink-900 font-semibold"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {title}
        </p>
      </div>
      <div className="px-4 py-4 flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-ink-700 font-medium"
        style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors",
          "focus:border-green-700 focus:ring-1 focus:ring-green-700",
          disabled && "bg-ink-50 text-ink-400 cursor-not-allowed"
        )}
        style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
      />
    </div>
  )
}
