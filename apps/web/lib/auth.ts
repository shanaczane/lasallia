const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type Role = "librarian" | "student" | "guest"

export type UserProfile = {
  id: string
  email: string
  role: Role
  full_name: string | null
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

export function saveSession(data: TokenResponse): void {
  localStorage.setItem("access_token", data.access_token)
  localStorage.setItem("refresh_token", data.refresh_token)
  localStorage.setItem("user", JSON.stringify(data.user))
  setSessionCookie(data.user.role)
}

export function getToken(): string | null {
  return localStorage.getItem("access_token")
}

export function getUser(): UserProfile | null {
  const raw = localStorage.getItem("user")
  return raw ? JSON.parse(raw) : null
}

export function clearSession(): void {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
  localStorage.removeItem("user")
  clearSessionCookie()
}

export function roleRedirect(role: string): string {
  switch (role) {
    case "librarian": return "/librarian/dashboard"
    case "student":   return "/student/dashboard"
    case "guest":     return "/guest/dashboard"
    default:
      console.warn(`roleRedirect: unrecognized role "${role}", defaulting to student route`)
      return "/student/dashboard"
  }
}
