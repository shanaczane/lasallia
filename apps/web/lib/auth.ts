import { getSupabaseAuth } from "@/lib/supabaseBrowser"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type Role = "librarian" | "student" | "faculty" | "guest"

export type UserProfile = {
  id: string
  email: string
  role: Role
  full_name: string | null
  program?: string | null
  year_level?: number | null
  college?: string | null
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: UserProfile
}

export async function loginRequest(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Invalid email or password")
  }

  return res.json()
}

// Google sign-in — redirects to Google via Supabase, which returns to
// /auth/callback. `hd` only filters Google's account picker; the role
// (student vs guest) is decided server-side by the profiles trigger.
export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabaseAuth().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${location.origin}/auth/callback`,
      queryParams: { hd: "dlsl.edu.ph" },
    },
  })
  if (error) throw new Error(error.message)
}

// Profile (role included) for a Supabase access token that didn't come
// from /auth/login — i.e. the Google callback.
export async function fetchMe(accessToken: string): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Could not load your profile")
  return res.json()
}

// Readable by middleware to gate /librarian/* routes. This is routing
// convenience only, NOT the security boundary — a client-writable cookie can
// be forged, so every request that touches librarian-only data must still
// verify the caller's role server-side (the same job an RLS policy would do
// if this were backed by Supabase). The API stub does not enforce that yet.
const SESSION_ROLE_COOKIE = "lasallia_role"

function setSessionCookie(role: Role): void {
  document.cookie = `${SESSION_ROLE_COOKIE}=${role}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`
}

function clearSessionCookie(): void {
  document.cookie = `${SESSION_ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

// "Remember me" — unchecked, the session lives in sessionStorage (gone the
// moment the tab/browser closes); checked (and Google sign-in, which has no
// checkbox — see app/auth/callback/page.tsx), it lives in localStorage
// (survives closing the browser entirely). Before this, everything always
// went to localStorage regardless of the checkbox, so unchecking it did
// nothing — signing out was the only way to actually end the session.
const SESSION_KEYS = ["access_token", "refresh_token", "user"] as const

function sessionStore(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage
}

export function saveSession(data: TokenResponse, remember: boolean = true): void {
  const store = sessionStore(remember)
  const other = sessionStore(!remember)
  store.setItem("access_token", data.access_token)
  store.setItem("refresh_token", data.refresh_token)
  store.setItem("user", JSON.stringify(data.user))
  // Clear the other storage so a session from an earlier, differently-
  // checked login doesn't linger there and get picked up by getToken().
  for (const key of SESSION_KEYS) other.removeItem(key)
  setSessionCookie(data.user.role)
}

// sessionStorage checked first — if "remember me" was off, that's the only
// place the session exists, and it deliberately has nothing to fall back to
// once the tab closes.
export function getToken(): string | null {
  return sessionStorage.getItem("access_token") ?? localStorage.getItem("access_token")
}

export function getUser(): UserProfile | null {
  const raw = sessionStorage.getItem("user") ?? localStorage.getItem("user")
  return raw ? JSON.parse(raw) : null
}

// After a successful PATCH /auth/me, so getUser() reflects the change
// immediately everywhere it's read — without this, the cached copy from
// login would keep showing the old name until the next full sign-in.
// Written back to whichever storage actually holds the session.
function setCachedUser(user: UserProfile): void {
  const store = sessionStorage.getItem("access_token") ? sessionStorage : localStorage
  store.setItem("user", JSON.stringify(user))
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

// Settings' Account tab — self-service full name change. Email isn't
// wired here: it needs Supabase Auth's own confirm-by-email flow, a
// separate feature.
export async function updateProfile(fullName: string): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ full_name: fullName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Could not update your profile")
  }
  const user: UserProfile = await res.json()
  setCachedUser(user)
  return user
}

// Re-reads the signed-in user's profile from the API and refreshes the
// cached copy. The login response's copy goes stale when a librarian fills
// in program/year level afterward (Patrons screen or the enrollment import).
export async function refreshCachedUser(): Promise<UserProfile | null> {
  const token = getToken()
  if (!token) return null
  try {
    const user = await fetchMe(token)
    setCachedUser(user)
    return user
  } catch {
    return null
  }
}

// First-login "complete your profile" form (students/faculty who signed in
// with Google and aren't in the enrollment spreadsheet yet). A student sends
// program+year_level(+college); faculty send college only (the API 403s a
// faculty caller that sends program/year_level — see routers/auth.py).
// rfid_uid is not here on purpose — only a librarian assigns a card.
export async function updateAcademicProfile(fields: {
  program?: string
  year_level?: number
  college?: string | null
}): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Could not save your details")
  }
  const user: UserProfile = await res.json()
  setCachedUser(user)
  return user
}

// Settings' Account tab — "Change Password". The API re-verifies
// currentPassword by signing in with it before applying newPassword; a
// wrong current password comes back as a normal thrown Error, same as
// every other call here.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/change-password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Could not change your password")
  }
}

export function clearSession(): void {
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
  clearSessionCookie()
}

export function roleRedirect(role: string): string {
  switch (role) {
    case "librarian": return "/librarian/dashboard"
    // Faculty share the student site and rules — same route, no separate
    // faculty layout to keep in sync.
    case "student":
    case "faculty":   return "/student/dashboard"
    case "guest":     return "/guest/dashboard"
    default:
      console.warn(`roleRedirect: unrecognized role "${role}", defaulting to student route`)
      return "/student/dashboard"
  }
}
