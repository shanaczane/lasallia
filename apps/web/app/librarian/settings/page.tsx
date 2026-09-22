// apps/web/app/librarian/settings/page.tsx
// Library Info + Borrowing Rules are now a real, shared, persisted row
// (GET/PATCH /settings — apps/api/migrations/0024_library_settings.sql)
// instead of local useState with a fake "Saved" button: every number here
// now actually drives borrow/reservation/fine behavior system-wide (see
// core/settings.py's callers in routers/borrow.py, holds.py, loans.py,
// reservations.py, core/calendar.py), and survives a restart because it
// lives in the database, not this page's component state.
//
// Account tab shows the real signed-in librarian now (getUser(), cached
// from login); Full Name saves via PATCH /auth/me (the header Save
// button) and Change Password is its own action via POST
// /auth/change-password (its own button below, not bundled into Save —
// a wrong current password shouldn't also block a harmless name edit,
// or vice versa). Email change still isn't wired — it needs Supabase
// Auth's own confirm-by-email flow, a separate feature.
"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchLibrarySettings, updateLibrarySettings, type LibrarySettings, type UpdateLibrarySettings } from "@/lib/settings"
import { changePassword, getUser, updateProfile, type UserProfile as AuthUser } from "@/lib/auth"
import { SupportTicketsPanel } from "@/components/support/SupportTicketsPanel"

const MIN_PASSWORD_LENGTH = 8

type TabKey = "library" | "borrowing" | "account" | "support"

const TABS: { key: TabKey; label: string }[] = [
  { key: "library", label: "Library Info" },
  { key: "borrowing", label: "Borrowing Rules" },
  { key: "account", label: "Account" },
  { key: "support", label: "Support" },
]

type Draft = Omit<LibrarySettings, "updated_at" | "updated_by" | "is_default">

// Every one of these represents a count, a period in days, or a peso
// amount — none of them make sense at zero or negative, and an empty
// required text field would silently save blank contact info. Checked
// client-side so Save can't even be clicked on a broken draft, rather
// than relying on the API to reject it after the fact.
function draftError(d: Draft): string | null {
  if (!d.library_name.trim()) return "Library Name can't be empty."
  if (!d.address.trim()) return "Address can't be empty."
  if (!d.contact_email.trim()) return "Contact Email can't be empty."
  if (!d.contact_number.trim()) return "Contact Number can't be empty."
  const positiveIntFields: [keyof Draft, string][] = [
    ["max_books_per_borrower", "Maximum Books per Borrower"],
    ["standard_loan_period_days", "Standard Loan Period"],
    ["max_renewals", "Maximum Renewals"],
    ["renewal_period_days", "Renewal Period"],
    ["reservation_hold_period_days", "Reservation Hold Period"],
    ["max_active_reservations", "Maximum Active Reservations per User"],
  ]
  for (const [key, label] of positiveIntFields) {
    if (!Number.isInteger(d[key]) || (d[key] as number) <= 0) return `${label} must be a whole number greater than 0.`
  }
  if (typeof d.fine_per_day !== "number" || d.fine_per_day < 0) return "Fine per Day can't be negative."
  if (typeof d.max_fine_per_book !== "number" || d.max_fine_per_book <= 0) return "Maximum Fine per Book must be greater than 0."

  // All three groups — weekday included — can be marked Closed, so all
  // three get the same check: either both times set (and in order), or
  // both null. One rule, no special-cased "weekday is different."
  for (const [label, open, close] of [
    ["Weekday", d.weekday_open_time, d.weekday_close_time],
    ["Saturday", d.saturday_open_time, d.saturday_close_time],
    ["Sunday", d.sunday_open_time, d.sunday_close_time],
  ] as const) {
    if (open && close) {
      if (timeToMinutes(open) >= timeToMinutes(close)) return `${label} closing time must be after opening time.`
    } else if (open || close) {
      // Shouldn't happen through the UI (the Closed toggle sets both
      // together) but guarded in case a draft ever gets here otherwise.
      return `${label} needs both an opening and closing time, or mark it Closed.`
    }
  }
  return null
}

function timeToMinutes(v: string): number {
  const [h, m] = shortTime(v).split(":").map(Number)
  return h * 60 + m
}

// <input type="time">'s value wants "HH:MM" — the API can hand back
// "HH:MM:SS" (a plain Postgres time), so trim rather than assume either.
function shortTime(v: string | null): string {
  return v ? v.slice(0, 5) : ""
}

function toDraft(s: LibrarySettings): Draft {
  return {
    library_name: s.library_name,
    address: s.address,
    contact_email: s.contact_email,
    contact_number: s.contact_number,
    max_books_per_borrower: s.max_books_per_borrower,
    standard_loan_period_days: s.standard_loan_period_days,
    max_renewals: s.max_renewals,
    renewal_period_days: s.renewal_period_days,
    fine_per_day: s.fine_per_day,
    max_fine_per_book: s.max_fine_per_book,
    reservation_hold_period_days: s.reservation_hold_period_days,
    max_active_reservations: s.max_active_reservations,
    weekday_open_time: s.weekday_open_time,
    weekday_close_time: s.weekday_close_time,
    saturday_open_time: s.saturday_open_time,
    saturday_close_time: s.saturday_close_time,
    sunday_open_time: s.sunday_open_time,
    sunday_close_time: s.sunday_close_time,
  }
}

const VALID_TABS: TabKey[] = ["library", "borrowing", "account", "support"]

function LibrarianSettingsPageContent() {
  const searchParams = useSearchParams()
  // Lets a link (e.g. the "New support ticket submitted" notification)
  // open straight to a specific tab via ?tab=support instead of always
  // landing on Library Info.
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const t = searchParams.get("tab")
    return (VALID_TABS as string[]).includes(t ?? "") ? (t as TabKey) : "library"
  })

  const [settings, setSettings] = useState<LibrarySettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  // One shared confirmation toast for every save action on this page
  // (library/borrowing settings, profile, password) — replaces each
  // button's own "✓ Saved" label-and-color swap, which changed the
  // button's size/position on every save and doubled up the same
  // "it worked" signal three different ways across the page.
  const [toast, setToast] = useState<string | null>(null)
  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 2500)
  }

  // Account tab — the real signed-in user, cached from login (no fetch
  // needed; the same object every layout's nav would read). fullName is
  // the editable draft; profile itself updates only after a successful save.
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [fullName, setFullName] = useState("")

  // Change Password — deliberately separate state/button from the rest
  // of the page (see the file header comment for why).
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState("")

  useEffect(() => {
    fetchLibrarySettings()
      .then((s) => {
        setSettings(s)
        setDraft(toDraft(s))
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false))

    // getUser() only reads localStorage (nothing to await) but setState
    // still needs to happen inside a callback here, not the effect body
    // directly, same as the settings fetch above — one microtask tick.
    Promise.resolve().then(() => {
      const u = getUser()
      setProfile(u)
      setFullName(u?.full_name ?? "")
    })
  }, [])

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const validationError = draft ? draftError(draft) : null

  async function handleSave() {
    if (activeTab === "account") {
      if (!fullName.trim()) {
        setSaveError("Full Name can't be empty.")
        return
      }
      setSaving(true)
      setSaveError("")
      try {
        const updated = await updateProfile(fullName.trim())
        setProfile(updated)
        setFullName(updated.full_name ?? "")
        showToast("Profile updated.")
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Could not update your profile")
      } finally {
        setSaving(false)
      }
      return
    }
    if (!draft) return
    if (validationError) {
      setSaveError(validationError)
      return
    }
    setSaving(true)
    setSaveError("")
    try {
      const changes: UpdateLibrarySettings = { ...draft }
      const updated = await updateLibrarySettings(changes)
      setSettings(updated)
      setDraft(toDraft(updated))
      showToast("Settings saved.")
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save settings")
    } finally {
      setSaving(false)
    }
  }

  const passwordValidationError = !currentPassword && !newPassword && !confirmPassword
    ? null // untouched — don't nag before they've typed anything
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
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      showToast("Password updated.")
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not change your password")
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-5 sm:px-8 sm:py-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className="text-ink-900 font-semibold leading-tight"
            style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}
          >
            Settings
          </h1>
          <p
            className="text-ink-500 mt-1"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            Manage library configuration and preferences
          </p>
        </div>

        {activeTab !== "support" && (
          <button
            onClick={handleSave}
            disabled={
              saving ||
              loading ||
              (activeTab === "account" ? !fullName.trim() : !draft || !!validationError)
            }
            className="self-start sm:self-auto px-4 py-2.5 rounded-(--radius) font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-green-700 text-white hover:bg-green-800"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 bg-ink-900 text-white px-4 py-2.5 rounded-(--radius) shadow-lg"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {toast}
        </div>
      )}

      {activeTab !== "support" && settings?.is_default && (
        <div
          className="flex items-start gap-2 rounded-(--radius) border border-warn/30 bg-warn-bg px-4 py-3 text-warn"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            These are the system defaults — the settings table hasn&apos;t been created in this database yet
            (run migrations/0024_library_settings.sql). Saving will fail until it has.
          </span>
        </div>
      )}

      {activeTab !== "support" && (saveError || (activeTab !== "account" && validationError)) && (
        <div
          className="flex items-start gap-2 rounded-(--radius) border border-danger/30 bg-danger-bg px-4 py-3 text-danger"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{saveError || validationError}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-ink-200 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
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
      <div className={cn("flex flex-col gap-4", activeTab === "support" ? "max-w-4xl" : "max-w-2xl")}>

        {activeTab === "support" ? (
          <SupportTicketsPanel />
        ) : loadError ? (
          <p className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {loadError}
          </p>
        ) : loading || !draft ? (
          <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            Loading…
          </p>
        ) : (
          <>
            {activeTab === "library" && (
              <>
                <SettingsSection title="Library Information">
                  <Field label="Library Name" value={draft.library_name} onChange={(v) => setField("library_name", v)} />
                  <Field label="Address" value={draft.address} onChange={(v) => setField("address", v)} />
                  <Field label="Contact Email" value={draft.contact_email} onChange={(v) => setField("contact_email", v)} type="email" />
                  <Field label="Contact Number" value={draft.contact_number} onChange={(v) => setField("contact_number", v)} type="tel" />
                </SettingsSection>

                <SettingsSection title="Operating Hours">
                  <div className="flex flex-col gap-3">
                    <HoursEditRow
                      day="Monday – Friday"
                      closable
                      openValue={draft.weekday_open_time}
                      closeValue={draft.weekday_close_time}
                      onChangeOpen={(v) => setField("weekday_open_time", v)}
                      onChangeClose={(v) => setField("weekday_close_time", v)}
                      onToggleClosed={(closed) => {
                        setField("weekday_open_time", closed ? null : "07:30")
                        setField("weekday_close_time", closed ? null : "18:00")
                      }}
                    />
                    <HoursEditRow
                      day="Saturday"
                      closable
                      openValue={draft.saturday_open_time}
                      closeValue={draft.saturday_close_time}
                      onChangeOpen={(v) => setField("saturday_open_time", v)}
                      onChangeClose={(v) => setField("saturday_close_time", v)}
                      onToggleClosed={(closed) => {
                        setField("saturday_open_time", closed ? null : "08:00")
                        setField("saturday_close_time", closed ? null : "12:00")
                      }}
                      onCopyWeekday={() => {
                        setField("saturday_open_time", draft.weekday_open_time)
                        setField("saturday_close_time", draft.weekday_close_time)
                      }}
                    />
                    <HoursEditRow
                      day="Sunday"
                      closable
                      openValue={draft.sunday_open_time}
                      closeValue={draft.sunday_close_time}
                      onChangeOpen={(v) => setField("sunday_open_time", v)}
                      onChangeClose={(v) => setField("sunday_close_time", v)}
                      onToggleClosed={(closed) => {
                        setField("sunday_open_time", closed ? null : "08:00")
                        setField("sunday_close_time", closed ? null : "12:00")
                      }}
                      onCopyWeekday={() => {
                        setField("sunday_open_time", draft.weekday_open_time)
                        setField("sunday_close_time", draft.weekday_close_time)
                      }}
                    />
                  </div>
                  <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                    Overdue fines only accrue for hours the library is actually open, per this schedule — mark a
                    day Closed (or shorten its hours) and no fine builds up during that time.
                  </p>
                </SettingsSection>
              </>
            )}

            {activeTab === "borrowing" && (
              <>
                <SettingsSection title="Loan Settings">
                  <Field label="Maximum Books per Borrower" value={String(draft.max_books_per_borrower)} onChange={(v) => setField("max_books_per_borrower", toInt(v))} type="number" />
                  <Field label="Standard Loan Period (days)" value={String(draft.standard_loan_period_days)} onChange={(v) => setField("standard_loan_period_days", toInt(v))} type="number" />
                  <Field label="Maximum Renewals" value={String(draft.max_renewals)} onChange={(v) => setField("max_renewals", toInt(v))} type="number" />
                  <Field label="Renewal Period (days)" value={String(draft.renewal_period_days)} onChange={(v) => setField("renewal_period_days", toInt(v))} type="number" />
                  <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                    Renewals aren&apos;t a built feature yet, so these two save but aren&apos;t enforced anywhere yet.
                  </p>
                </SettingsSection>

                <SettingsSection title="Fine Settings">
                  <Field label="Fine per Day (PHP)" value={String(draft.fine_per_day)} onChange={(v) => setField("fine_per_day", toFloat(v))} type="number" />
                  <Field label="Maximum Fine per Book (PHP)" value={String(draft.max_fine_per_book)} onChange={(v) => setField("max_fine_per_book", toFloat(v))} type="number" />
                </SettingsSection>

                <SettingsSection title="Reservation Settings">
                  <Field label="Reservation Hold Period (days)" value={String(draft.reservation_hold_period_days)} onChange={(v) => setField("reservation_hold_period_days", toInt(v))} type="number" />
                  <Field label="Maximum Active Reservations per User" value={String(draft.max_active_reservations)} onChange={(v) => setField("max_active_reservations", toInt(v))} type="number" />
                </SettingsSection>
              </>
            )}

            {activeTab === "account" && (
              <>
                <SettingsSection title="Profile">
                  {profile ? (
                    <>
                      <Field label="Full Name" value={fullName} onChange={setFullName} />
                      <Field label="Email" value={profile.email} onChange={() => {}} type="email" disabled />
                      <Field
                        label="Role"
                        value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                        onChange={() => {}}
                        disabled
                      />
                    </>
                  ) : (
                    <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                      Couldn&apos;t find your signed-in session — try reloading the page.
                    </p>
                  )}
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
                <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                  Email changes aren&apos;t wired up yet — that needs Supabase&apos;s own confirm-by-email flow.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function LibrarianSettingsPage() {
  return (
    <Suspense fallback={null}>
      <LibrarianSettingsPageContent />
    </Suspense>
  )
}

function toInt(v: string): number {
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? 0 : n
}

function toFloat(v: string): number {
  const n = parseFloat(v)
  return Number.isNaN(n) ? 0 : n
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

function HoursEditRow({
  day,
  openValue,
  closeValue,
  onChangeOpen,
  onChangeClose,
  closable = false,
  onToggleClosed,
  onCopyWeekday,
}: {
  day: string
  openValue: string | null
  closeValue: string | null
  onChangeOpen: (value: string) => void
  onChangeClose: (value: string) => void
  closable?: boolean
  onToggleClosed?: (closed: boolean) => void
  /** "Same as Weekday" shortcut — only offered on closable (Sat/Sun) rows. */
  onCopyWeekday?: () => void
}) {
  const isClosed = closable && !openValue && !closeValue
  const timeInputClass = cn(
    "px-2.5 py-2 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors",
    "focus:border-green-700 focus:ring-1 focus:ring-green-700 hover:border-ink-300"
  )

  return (
    <div
      className={cn(
        "rounded-(--radius-sm) border p-3 flex flex-col gap-2.5 transition-colors",
        isClosed ? "border-ink-100 bg-ink-50/60" : "border-ink-200 bg-white"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-ink-900 font-semibold"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {day}
        </span>

        <div className="flex items-center gap-3">
          {closable && !isClosed && onCopyWeekday && (
            <button
              type="button"
              onClick={onCopyWeekday}
              className="text-green-700 hover:text-green-900 font-medium underline-offset-2 hover:underline transition-colors"
              style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
            >
              Same as Weekday
            </button>
          )}
          {closable && (
            <label
              className="flex items-center gap-1.5 text-ink-500 cursor-pointer select-none"
              style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
            >
              <input
                type="checkbox"
                checked={isClosed}
                onChange={(e) => onToggleClosed?.(e.target.checked)}
                className="accent-green-700"
              />
              Closed
            </label>
          )}
        </div>
      </div>

      {isClosed ? (
        <p className="text-ink-400" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}>
          Closed — no fines accrue during this time.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}>
              Opens
            </span>
            <input
              type="time"
              value={shortTime(openValue)}
              onChange={(e) => onChangeOpen(e.target.value)}
              className={timeInputClass}
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            />
          </label>
          <span className="text-ink-300 pb-2" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
            –
          </span>
          <label className="flex flex-col gap-1">
            <span className="text-ink-400 uppercase font-semibold" style={{ fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-caps)" }}>
              Closes
            </span>
            <input
              type="time"
              value={shortTime(closeValue)}
              onChange={(e) => onChangeClose(e.target.value)}
              className={timeInputClass}
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
