// "Who is using Lasallia?": pick a profile, then enter a PIN or tap a staff
// ID. The reader types the card's id and presses Enter, like the desk tap, so
// one masked field takes both and the id never shows on screen.

"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Lock, UserRound } from "lucide-react"
import { clearSession } from "@/lib/auth"
import {
  SharedSessionExpiredError,
  credentialFrom,
  fetchProfileOptions,
  saveActiveProfile,
  signInProfile,
  type ProfileOption,
} from "@/lib/librarianProfile"
import { cn } from "@/lib/utils"

const body = { fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" } as const
const small = { fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" } as const

function signOut() {
  clearSession()
  window.location.replace("/login")
}

function lockedText(seconds: number): string {
  const minutes = Math.max(Math.ceil(seconds / 60), 1)
  return `Locked for ${minutes} more minute${minutes === 1 ? "" : "s"}`
}

export function LibrarianProfilePicker() {
  const [options, setOptions] = useState<ProfileOption[] | null>(null)
  const [loadError, setLoadError] = useState("")
  const [selected, setSelected] = useState<ProfileOption | null>(null)

  function load() {
    fetchProfileOptions()
      .then((profiles) => {
        setOptions(profiles)
        setLoadError("")
      })
      .catch((err) => {
        if (err instanceof SharedSessionExpiredError) signOut()
        else setLoadError(err instanceof Error ? err.message : "Could not load the librarian profiles")
      })
  }

  useEffect(load, [])

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex items-center justify-center rounded-full bg-white border border-ink-200"
            style={{ width: 56, height: 56, boxShadow: "var(--shadow-sm)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/DeLaSalleLipa_Seal.png" alt="De La Salle Lipa" className="object-contain" style={{ width: 42, height: 42, mixBlendMode: "multiply" }} />
          </div>
          <h1 className="text-ink-900 font-semibold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)" }}>
            Who is using Lasallia?
          </h1>
        </div>

        <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex flex-col gap-2" style={{ boxShadow: "var(--shadow-sm)" }}>
          {selected ? (
            <CredentialStep
              profile={selected}
              onBack={() => {
                setSelected(null)
                load()
              }}
            />
          ) : loadError ? (
            <div className="flex flex-col gap-2">
              <p className="text-danger" style={body}>{loadError}</p>
              <button type="button" onClick={load} className="self-start text-green-700 font-medium hover:underline" style={body}>
                Try again
              </button>
            </div>
          ) : options === null ? (
            <p className="text-ink-400" style={body}>Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-ink-500" style={body}>
              No librarian profiles have been set up yet. Ask the system administrator to create the first one.
            </p>
          ) : (
            options.map((option) => {
              const locked = option.locked_seconds > 0
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={locked}
                  onClick={() => setSelected(option)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-sm border border-ink-200 text-left transition-colors",
                    locked ? "bg-ink-50 cursor-not-allowed" : "hover:bg-green-50 hover:border-green-700"
                  )}
                >
                  <span className={locked ? "text-ink-400" : "text-green-700"}>
                    {locked ? <Lock size={18} /> : <UserRound size={18} />}
                  </span>
                  <span className="flex flex-col">
                    <span className={cn("font-medium", locked ? "text-ink-500" : "text-ink-900")} style={body}>
                      {option.full_name}
                    </span>
                    {locked && <span className="text-ink-500" style={small}>{lockedText(option.locked_seconds)}</span>}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <button type="button" onClick={signOut} className="self-center text-ink-500 hover:text-ink-900 transition-colors" style={body}>
          Sign out
        </button>
      </div>
    </main>
  )
}

function CredentialStep({ profile, onBack }: { profile: ProfileOption; onBack: () => void }) {
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (busy) return
    const credential = credentialFrom(value)
    setValue("")
    if (!credential) {
      setError("Enter your 4 to 6 digit PIN, or tap your staff ID.")
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    setError("")
    try {
      // This unmounts the picker.
      saveActiveProfile(await signInProfile(profile.id, credential))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in to this profile")
      setBusy(false)
      // The input is disabled while busy, so focus once it's back.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <button type="button" onClick={onBack} className="self-start inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-900 transition-colors" style={small}>
        <ArrowLeft size={14} /> Choose someone else
      </button>
      <p className="text-ink-900 font-semibold" style={body}>{profile.full_name}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="librarian-credential" className="text-ink-700 font-medium" style={body}>
          Enter your PIN or tap your staff ID
        </label>
        <input
          ref={inputRef}
          id="librarian-credential"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          disabled={busy}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3 py-2 rounded-sm border border-ink-200 text-ink-900 outline-none transition-colors focus:border-green-700 focus:ring-1 focus:ring-green-700"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm-body)" }}
        />
      </div>
      {error && <p role="alert" className="text-danger" style={small}>{error}</p>}
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="px-4 py-2.5 rounded-(--radius) font-medium transition-colors bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
        style={body}
      >
        {busy ? "Checking…" : "Continue"}
      </button>
    </form>
  )
}
