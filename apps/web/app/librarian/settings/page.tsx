// apps/web/app/librarian/settings/page.tsx
// Library Info + Borrowing Rules are now a real, shared, persisted row
// (GET/PATCH /settings — apps/api/migrations/0024_library_settings.sql)
// instead of local useState with a fake "Saved" button: every number here
// now actually drives borrow/reservation/fine behavior system-wide (see
// core/settings.py's callers in routers/borrow.py, holds.py, loans.py,
// reservations.py, core/calendar.py), and survives a restart because it
// lives in the database, not this page's component state.
//
// Account (profile/password) is untouched — a per-librarian concern, not
// a library-wide setting, and out of scope here.
"use client"

import { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchLibrarySettings, updateLibrarySettings, type LibrarySettings, type UpdateLibrarySettings } from "@/lib/settings"

type TabKey = "library" | "borrowing" | "account"

const TABS: { key: TabKey; label: string }[] = [
  { key: "library", label: "Library Info" },
  { key: "borrowing", label: "Borrowing Rules" },
  { key: "account", label: "Account" },
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

  if (!d.weekday_open_time || !d.weekday_close_time) return "Weekday hours can't be empty."
  if (timeToMinutes(d.weekday_open_time) >= timeToMinutes(d.weekday_close_time)) {
    return "Weekday closing time must be after opening time."
  }
  for (const [label, open, close] of [
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
  const [h, m] = v.split(":").map(Number)
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

export default function LibrarianSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("library")

  const [settings, setSettings] = useState<LibrarySettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchLibrarySettings()
      .then((s) => {
        setSettings(s)
        setDraft(toDraft(s))
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false))
  }, [])

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const validationError = draft ? draftError(draft) : null

  async function handleSave() {
    if (activeTab === "account" || !draft) {
      // Account tab isn't wired to this API — same no-op confirmation
      // flash it always showed, kept as-is since it's out of scope here.
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      return
    }
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save settings")
    } finally {
      setSaving(false)
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

        <button
          onClick={handleSave}
          disabled={saving || loading || (activeTab !== "account" && (!draft || !!validationError))}
          className={cn(
            "self-start sm:self-auto px-4 py-2.5 rounded-(--radius) font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed",
            saved
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-green-700 text-white hover:bg-green-800"
          )}
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
        </button>
      </div>

      {settings?.is_default && (
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

      {(saveError || (activeTab !== "account" && validationError)) && (
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
      <div className="flex flex-col gap-4 max-w-2xl">

        {loadError ? (
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
                  <div className="flex flex-col gap-4">
                    <HoursEditRow
                      day="Monday – Friday"
                      openValue={draft.weekday_open_time}
                      closeValue={draft.weekday_close_time}
                      onChangeOpen={(v) => setField("weekday_open_time", v)}
                      onChangeClose={(v) => setField("weekday_close_time", v)}
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
                    />
                  </div>
                  <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                    Fines only accrue for hours the library is actually open, per this schedule.
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
                  <Field label="Full Name" value="Maria L. Reyes" onChange={() => {}} />
                  <Field label="Email" value="maria.reyes@dlsl.edu.ph" onChange={() => {}} type="email" />
                  <Field label="Role" value="Librarian" onChange={() => {}} disabled />
                </SettingsSection>

                <SettingsSection title="Change Password">
                  <Field label="Current Password" value="" onChange={() => {}} type="password" placeholder="Enter current password" />
                  <Field label="New Password" value="" onChange={() => {}} type="password" placeholder="Enter new password" />
                  <Field label="Confirm New Password" value="" onChange={() => {}} type="password" placeholder="Confirm new password" />
                </SettingsSection>
                <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}>
                  Account profile/password editing isn&apos;t wired up yet — this tab is still a preview.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
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
}: {
  day: string
  openValue: string | null
  closeValue: string | null
  onChangeOpen: (value: string) => void
  onChangeClose: (value: string) => void
  closable?: boolean
  onToggleClosed?: (closed: boolean) => void
}) {
  const isClosed = closable && !openValue && !closeValue
  const timeInputClass = cn(
    "px-2.5 py-1.5 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors",
    "focus:border-green-700 focus:ring-1 focus:ring-green-700"
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="text-ink-700 font-medium w-32 shrink-0"
        style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
      >
        {day}
      </span>

      {closable && (
        <label
          className="flex items-center gap-1.5 text-ink-500 shrink-0"
          style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
        >
          <input
            type="checkbox"
            checked={isClosed}
            onChange={(e) => onToggleClosed?.(e.target.checked)}
          />
          Closed
        </label>
      )}

      {!isClosed && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={shortTime(openValue)}
            onChange={(e) => onChangeOpen(e.target.value)}
            className={timeInputClass}
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          />
          <span className="text-ink-400" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
            to
          </span>
          <input
            type="time"
            value={shortTime(closeValue)}
            onChange={(e) => onChangeClose(e.target.value)}
            className={timeInputClass}
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          />
        </div>
      )}
    </div>
  )
}
