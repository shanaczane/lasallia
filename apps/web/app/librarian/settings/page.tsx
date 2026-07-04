// apps/web/app/librarian/settings/page.tsx
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

type TabKey = "library" | "borrowing" | "account"

const TABS: { key: TabKey; label: string }[] = [
  { key: "library", label: "Library Info" },
  { key: "borrowing", label: "Borrowing Rules" },
  { key: "account", label: "Account" },
]

export default function LibrarianSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("library")
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
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
          className={cn(
            "self-start sm:self-auto px-4 py-2.5 rounded-(--radius) font-medium transition-colors shadow-sm",
            saved
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-green-700 text-white hover:bg-green-800"
          )}
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          {saved ? "✓ Saved" : "Save changes"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ink-200 overflow-x-auto">
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

        {activeTab === "library" && (
          <>
            <SettingsSection title="Library Information">
              <Field label="Library Name" defaultValue="De La Salle Lipa — Learning Resource Center" />
              <Field label="Address" defaultValue="Southgate, Lipa City, Batangas, Philippines" />
              <Field label="Contact Email" defaultValue="lrc@dlsl.edu.ph" type="email" />
              <Field label="Contact Number" defaultValue="+63 43 756 8000" type="tel" />
            </SettingsSection>

            <SettingsSection title="Operating Hours">
              <div className="flex flex-col gap-3">
                <HoursRow day="Monday – Friday" hours="7:30 AM – 6:00 PM" />
                <HoursRow day="Saturday" hours="8:00 AM – 12:00 PM" />
                <HoursRow day="Sunday" hours="Closed" />
              </div>
            </SettingsSection>
          </>
        )}

        {activeTab === "borrowing" && (
          <>
            <SettingsSection title="Loan Settings">
              <Field label="Maximum Books per Borrower" defaultValue="5" type="number" />
              <Field label="Standard Loan Period (days)" defaultValue="14" type="number" />
              <Field label="Maximum Renewals" defaultValue="2" type="number" />
              <Field label="Renewal Period (days)" defaultValue="7" type="number" />
            </SettingsSection>

            <SettingsSection title="Fine Settings">
              <Field label="Fine per Day (PHP)" defaultValue="5.00" type="number" />
              <Field label="Maximum Fine per Book (PHP)" defaultValue="100.00" type="number" />
            </SettingsSection>

            <SettingsSection title="Reservation Settings">
              <Field label="Reservation Hold Period (days)" defaultValue="3" type="number" />
              <Field label="Maximum Active Reservations per User" defaultValue="3" type="number" />
            </SettingsSection>
          </>
        )}

        {activeTab === "account" && (
          <>
            <SettingsSection title="Profile">
              <Field label="Full Name" defaultValue="Maria L. Reyes" />
              <Field label="Email" defaultValue="maria.reyes@dlsl.edu.ph" type="email" />
              <Field label="Role" defaultValue="Librarian" disabled />
            </SettingsSection>

            <SettingsSection title="Change Password">
              <Field label="Current Password" defaultValue="" type="password" placeholder="Enter current password" />
              <Field label="New Password" defaultValue="" type="password" placeholder="Enter new password" />
              <Field label="Confirm New Password" defaultValue="" type="password" placeholder="Confirm new password" />
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
  defaultValue,
  type = "text",
  disabled = false,
  placeholder,
}: {
  label: string
  defaultValue: string
  type?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [value, setValue] = useState(defaultValue)

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
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-(--radius-sm) border border-ink-200 text-ink-900 outline-none transition-colors",
          "focus:border-green-700 focus:ring-1 focus:ring-green-700",
          disabled && "bg-ink-50 text-ink-400 cursor-not-allowed"
        )}
        style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
      />
    </div>
  )
}

function HoursRow({ day, hours }: { day: string; hours: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-700" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
        {day}
      </span>
      <span className="text-ink-500" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
        {hours}
      </span>
    </div>
  )
}