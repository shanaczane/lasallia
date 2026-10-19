import { getSupabaseAuth } from "@/lib/supabaseBrowser"
import { clearClientCache } from "@/lib/clientCache"

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
  id_number?: string | null
  // First-login privacy notice — null/absent = not accepted yet.
  privacy_accepted_at?: string | null
  privacy_notice_version?: string | null
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

// Google sign-in through a Supabase redirect, back to /auth/callback. `hd`
// only filters Google's account list; the server decides the role.
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

// Google sign-in with Google's own button, so Google's screen shows our
// site instead of the Supabase address. Used when
// NEXT_PUBLIC_GOOGLE_CLIENT_ID is set; otherwise signInWithGoogle is used.
export async function signInWithGoogleIdToken(idToken: string, rawNonce: string): Promise<UserProfile> {
  const { data, error } = await getSupabaseAuth().auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: rawNonce,
  })
  if (error || !data.session) throw new Error(error?.message ?? "Google sign-in didn't complete")
  return adoptSupabaseSession(data.session)
}

// Saves a Google sign-in session here and drops Supabase's copy. It's always
// remembered (there's no "remember me" box).
export async function adoptSupabaseSession(session: {
  access_token: string
  refresh_token: string
  expires_in: number
}): Promise<UserProfile> {
  const user = await fetchMe(session.access_token)
  saveSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user,
  })
  await getSupabaseAuth().auth.signOut({ scope: "local" })
  return user
}

// The user's profile for a token from Google sign-in.
export async function fetchMe(accessToken: string): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Could not load your profile")
  return res.json()
}

// Lets proxy.ts keep non-librarians off /librarian pages. Only a
// convenience: the cookie can be faked, so the API checks roles itself.
const SESSION_ROLE_COOKIE = "lasallia_role"

function setSessionCookie(role: Role): void {
  document.cookie = `${SESSION_ROLE_COOKIE}=${role}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`
}

function clearSessionCookie(): void {
  document.cookie = `${SESSION_ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

// "Remember me" on (and Google sign-in): localStorage, kept after closing
// the browser. Off: sessionStorage, gone when the tab closes.
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
  // Clear the other storage so an older session there isn't picked up.
  for (const key of SESSION_KEYS) other.removeItem(key)
  setSessionCookie(data.user.role)
}

// sessionStorage first, then localStorage.
export function getToken(): string | null {
  return sessionStorage.getItem("access_token") ?? localStorage.getItem("access_token")
}

export function getUser(): UserProfile | null {
  const raw = sessionStorage.getItem("user") ?? localStorage.getItem("user")
  return raw ? JSON.parse(raw) : null
}

// Updates the saved user after a profile change, in whichever storage
// holds the session.
function setCachedUser(user: UserProfile): void {
  const store = sessionStorage.getItem("access_token") ? sessionStorage : localStorage
  store.setItem("user", JSON.stringify(user))
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

// Changes the user's own name (email changes aren't supported yet).
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

// Reloads the user's profile, e.g. after a librarian changed it.
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

// The first-login "complete your profile" form. Students send program and
// year level (and college); faculty send college only.
export async function updateAcademicProfile(fields: {
  program?: string
  year_level?: number
  college?: string | null
  id_number?: string
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

// Changes the password. A wrong current password throws an Error.
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

// Whether the account has a password (Google-only accounts don't).
export async function fetchPasswordStatus(): Promise<{ has_password: boolean }> {
  const res = await fetch(`${API_URL}/auth/password-status`, { headers: authHeaders() })
  if (!res.ok) throw new Error("Could not check your account")
  return res.json()
}

// Sets a first password on a Google-only account. Google sign-in still works.
export async function setPassword(newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/set-password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ new_password: newPassword }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Could not set your password")
  }
}

// Records that the user accepted the privacy notice.
export async function acceptPrivacyNotice(): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/accept-privacy`, { method: "POST", headers: authHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Could not record your acceptance")
  }
  const user: UserProfile = await res.json()
  setCachedUser(user)
  return user
}

// Checked regularly by TopNav, so a deactivated account is signed out
// quickly. false only means the server said the account is inactive.
export async function verifySessionActive(): Promise<boolean> {
  const token = getToken()
  if (!token) return true
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 403) {
      clearSession()
      return false
    }
    return true
  } catch {
    return true
  }
}

export function clearSession(): void {
  for (const key of SESSION_KEYS) {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
  clearSessionCookie()
  clearClientCache()
}

export function roleRedirect(role: string): string {
  switch (role) {
    case "librarian": return "/librarian/dashboard"
    // Faculty use the same pages as students.
    case "student":
    case "faculty":   return "/user/dashboard"
    case "guest":     return "/guest/dashboard"
    default:
      console.warn(`roleRedirect: unrecognized role "${role}", defaulting to student route`)
      return "/user/dashboard"
  }
}
