// Settings → Librarians: the profiles under the shared librarian login. Add
// a profile, reset a PIN, link a staff ID by tapping it, disable or enable.

"use client"

import { useEffect, useState } from "react"
import { TapIdField } from "@/components/desk/TapIdField"
import { useActiveLibrarian } from "@/components/layout/LibrarianProfileGate"
import {
  createProfile,
  fetchManagedProfiles,
  linkStaffCard,
  resetProfilePin,
  setProfileActive,
  unlinkStaffCard,
  type ManagedProfile,
} from "@/lib/librarianProfile"
import { cn } from "@/lib/utils"

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" } as const
const small = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" } as const

const inputClass = "w-full px-3 py-2 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors focus:border-green-700 focus:ring-1 focus:ring-green-700"
const primaryButton = "px-4 py-2 rounded-(--radius) font-medium transition-colors bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
const linkButton = "font-medium text-green-700 hover:underline disabled:opacity-50"

const validPin = (pin: string) => /^\d{4,6}$/.test(pin)

type Open = { id: string; kind: "pin" | "card" } | null

export function LibrariansPanel({ onDone }: { onDone: (message: string) => void }) {
  const active = useActiveLibrarian()
  const [profiles, setProfiles] = useState<ManagedProfile[] | null>(null)
  const [error, setError] = useState("")
  const [open, setOpen] = useState<Open>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchManagedProfiles()
      .then(setProfiles)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the librarian profiles"))
  }, [])

  function replace(updated: ManagedProfile) {
    setProfiles((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p)))
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      setOpen(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-(--radius) border border-danger/30 bg-danger-bg px-4 py-3 text-danger" style={body}>
          {error}
        </p>
      )}

      <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100">
          <p className="text-ink-900 font-semibold" style={body}>Librarians</p>
        </div>
        {profiles === null ? (
          <p className="px-4 py-4 text-ink-400" style={body}>Loading…</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {profiles.map((profile) => {
              const isSelf = profile.id === active?.profile_id
              const isOpen = open?.id === profile.id
              return (
                <li key={profile.id} className="px-4 py-3 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-col">
                      <span className={cn("font-medium", profile.is_active ? "text-ink-900" : "text-ink-400")} style={body}>
                        {profile.full_name}{isSelf ? " (you)" : ""}
                      </span>
                      <span className="text-ink-500" style={small}>
                        {[
                          profile.is_active ? "Active" : "Disabled",
                          profile.locked_until ? "Locked for now" : null,
                          profile.has_staff_card ? "Staff ID linked" : "No staff ID",
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4" style={small}>
                      <button type="button" className={linkButton} onClick={() => setOpen(isOpen && open?.kind === "pin" ? null : { id: profile.id, kind: "pin" })}>
                        Reset PIN
                      </button>
                      {profile.has_staff_card ? (
                        <button
                          type="button"
                          className={linkButton}
                          disabled={busy}
                          onClick={() => run(async () => {
                            replace(await unlinkStaffCard(profile.id))
                            onDone("Staff ID unlinked.")
                          })}
                        >
                          Unlink staff ID
                        </button>
                      ) : (
                        <button type="button" className={linkButton} onClick={() => setOpen(isOpen && open?.kind === "card" ? null : { id: profile.id, kind: "card" })}>
                          Link staff ID
                        </button>
                      )}
                      {!isSelf && (
                        <button
                          type="button"
                          className={cn(linkButton, profile.is_active && "text-danger")}
                          disabled={busy}
                          onClick={() => run(async () => {
                            replace(await setProfileActive(profile.id, !profile.is_active))
                            onDone(profile.is_active ? "Profile disabled." : "Profile enabled.")
                          })}
                        >
                          {profile.is_active ? "Disable" : "Enable"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && open?.kind === "pin" && (
                    <PinForm
                      label={`New PIN for ${profile.full_name}`}
                      busy={busy}
                      onSubmit={(pin) => run(async () => {
                        await resetProfilePin(profile.id, pin)
                        onDone("PIN reset.")
                      })}
                    />
                  )}
                  {isOpen && open?.kind === "card" && (
                    <TapIdField
                      label={`Tap ${profile.full_name}'s staff ID`}
                      busy={busy}
                      onTap={(uid) => run(async () => {
                        replace(await linkStaffCard(profile.id, uid))
                        onDone("Staff ID linked.")
                      })}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AddLibrarian
        onAdded={(profile) => {
          setProfiles((list) => [...(list ?? []), profile].sort((a, b) => a.full_name.localeCompare(b.full_name)))
          onDone("Librarian added.")
        }}
      />
    </div>
  )
}

function PinForm({ label, busy, onSubmit }: { label: string; busy: boolean; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("")
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (validPin(pin)) onSubmit(pin)
      }}
    >
      <label className="text-ink-700 font-medium" style={small}>{label}</label>
      <div className="flex gap-2">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          autoFocus
          value={pin}
          maxLength={6}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="4 to 6 digits"
          className={inputClass}
          style={body}
        />
        <button type="submit" disabled={busy || !validPin(pin)} className={primaryButton} style={body}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}

function AddLibrarian({ onAdded }: { onAdded: (profile: ManagedProfile) => void }) {
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const ready = name.trim().length > 0 && validPin(pin)

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError("")
    try {
      onAdded(await createProfile(name.trim(), pin))
      setName("")
      setPin("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this librarian")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="px-4 py-3 border-b border-ink-100">
        <p className="text-ink-900 font-semibold" style={body}>Add a librarian</p>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-librarian-name" className="text-ink-700 font-medium" style={body}>Full Name</label>
          <input id="new-librarian-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={inputClass} style={body} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-librarian-pin" className="text-ink-700 font-medium" style={body}>PIN</label>
          <input
            id="new-librarian-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            maxLength={6}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="4 to 6 digits"
            className={inputClass}
            style={body}
          />
        </div>
        {error && <p role="alert" className="text-danger" style={small}>{error}</p>}
        <button type="submit" disabled={!ready || busy} className={cn(primaryButton, "self-start")} style={body}>
          {busy ? "Adding…" : "Add librarian"}
        </button>
      </div>
    </form>
  )
}
