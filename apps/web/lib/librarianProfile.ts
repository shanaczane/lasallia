// Who is using the shared librarian login right now. The API checks the
// active-profile token on librarian write actions; this file keeps the token
// for the tab, adds it to API calls and manages the profiles.

import { LIBRARIAN_PROFILE_KEY, getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const PROFILE_HEADER = "X-Librarian-Profile"

// Must match PROFILE_REQUIRED in apps/api/core/deps.py.
const PROFILE_REQUIRED = "Choose your librarian profile to continue."

export type ActiveProfile = {
  token: string
  expires_at: string
  profile_id: string
  full_name: string
  idle_timeout_minutes: number
}

export type ProfileOption = { id: string; full_name: string; locked_seconds: number }

export type ManagedProfile = {
  id: string
  full_name: string
  is_active: boolean
  has_staff_card: boolean
  locked_until: string | null
  created_at: string
}

// ── The active profile, kept per tab ──

let current: ActiveProfile | null | undefined
const listeners = new Set<() => void>()

function publish(next: ActiveProfile | null): void {
  current = next
  listeners.forEach((listener) => listener())
}

function isLive(profile: ActiveProfile): boolean {
  return new Date(profile.expires_at).getTime() > Date.now()
}

export function subscribeActiveProfile(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActiveProfile(): ActiveProfile | null {
  if (current === undefined) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(LIBRARIAN_PROFILE_KEY) ?? "null") as ActiveProfile | null
      current = saved && isLive(saved) ? saved : null
    } catch {
      current = null
    }
  }
  return current
}

export function saveActiveProfile(profile: ActiveProfile): void {
  try {
    sessionStorage.setItem(LIBRARIAN_PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Storage blocked: it lasts until the page is reloaded.
  }
  publish(profile)
}

// Back to "Who is using Lasallia?".
export function clearActiveProfile(): void {
  try {
    sessionStorage.removeItem(LIBRARIAN_PROFILE_KEY)
  } catch {
    // Nothing was saved.
  }
  publish(null)
}

// ── API calls in the librarian area ──

// All the picker needs. Nothing else may reach the API while it's showing.
function allowedWithoutProfile(path: string): boolean {
  return path === "/librarian-profiles/active" || /^\/librarian-profiles\/[^/]+\/sign-in$/.test(path)
}

// Every lib/*.ts builds its own fetch, so the header is added here, once,
// for as long as the librarian area is on screen. Returns how to undo it.
export function installProfileFetch(): () => void {
  const original = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    if (!url.startsWith(API_URL)) return original.call(window, input, init)

    const path = url.slice(API_URL.length).split("?")[0]
    const profile = getActiveProfile()
    if (!profile) {
      if (!allowedWithoutProfile(path)) throw new Error(PROFILE_REQUIRED)
      return original.call(window, input, init)
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(PROFILE_HEADER, profile.token)
    const res = await original.call(window, input, { ...init, headers })

    // The token ran out or the profile was disabled: pick again.
    if (res.status === 403) {
      const body = await res.clone().json().catch(() => null)
      if (body?.detail === PROFILE_REQUIRED) clearActiveProfile()
    }
    return res
  }
  return () => { window.fetch = original }
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}))
  return new Error(typeof body.detail === "string" ? body.detail : fallback)
}

// ── "Who is using Lasallia?" ──

// The shared login itself ran out; only signing in again helps.
export class SharedSessionExpiredError extends Error {}

export async function fetchProfileOptions(): Promise<ProfileOption[]> {
  const res = await fetch(`${API_URL}/librarian-profiles/active`, { headers: authHeaders() })
  if (res.status === 401) throw new SharedSessionExpiredError("Your session has ended")
  if (!res.ok) throw await errorFrom(res, "Could not load the librarian profiles")
  return res.json()
}

// 4 to 6 digits is a PIN. The reader types 8 or more characters and Enter
// (see tools/nfc-bridge), so anything longer is a tapped staff ID.
export function credentialFrom(typed: string): { pin: string } | { rfid_uid: string } | null {
  const value = typed.trim()
  if (/^\d{4,6}$/.test(value)) return { pin: value }
  return value.length > 6 ? { rfid_uid: value } : null
}

export async function signInProfile(profileId: string, credential: { pin: string } | { rfid_uid: string }): Promise<ActiveProfile> {
  const res = await fetch(`${API_URL}/librarian-profiles/${profileId}/sign-in`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(credential),
  })
  if (!res.ok) throw await errorFrom(res, "Could not sign in to this profile")
  return res.json()
}

export async function renewActiveProfile(): Promise<ActiveProfile> {
  const res = await fetch(`${API_URL}/librarian-profiles/session/renew`, { method: "POST", headers: authHeaders() })
  if (!res.ok) throw await errorFrom(res, "Could not renew the librarian session")
  return res.json()
}

// ── Manage Librarians ──

export async function fetchManagedProfiles(): Promise<ManagedProfile[]> {
  const res = await fetch(`${API_URL}/librarian-profiles`, { headers: authHeaders() })
  if (!res.ok) throw await errorFrom(res, "Could not load the librarian profiles")
  return res.json()
}

export async function createProfile(fullName: string, pin: string): Promise<ManagedProfile> {
  const res = await fetch(`${API_URL}/librarian-profiles`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ full_name: fullName, pin }),
  })
  if (!res.ok) throw await errorFrom(res, "Could not add this librarian")
  return res.json()
}

export async function setProfileActive(profileId: string, isActive: boolean): Promise<ManagedProfile> {
  const res = await fetch(`${API_URL}/librarian-profiles/${profileId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ is_active: isActive }),
  })
  if (!res.ok) throw await errorFrom(res, "Could not update this librarian")
  return res.json()
}

export async function resetProfilePin(profileId: string, pin: string): Promise<void> {
  const res = await fetch(`${API_URL}/librarian-profiles/${profileId}/reset-pin`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) throw await errorFrom(res, "Could not reset the PIN")
}

export async function linkStaffCard(profileId: string, rfidUid: string): Promise<ManagedProfile> {
  const res = await fetch(`${API_URL}/librarian-profiles/${profileId}/staff-card`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ rfid_uid: rfidUid }),
  })
  if (!res.ok) throw await errorFrom(res, "Could not link this staff ID")
  return res.json()
}

export async function unlinkStaffCard(profileId: string): Promise<ManagedProfile> {
  const res = await fetch(`${API_URL}/librarian-profiles/${profileId}/staff-card`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!res.ok) throw await errorFrom(res, "Could not unlink this staff ID")
  return res.json()
}
