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

export function saveSession(data: TokenResponse): void {
  localStorage.setItem("access_token", data.access_token)
  localStorage.setItem("refresh_token", data.refresh_token)
  localStorage.setItem("user", JSON.stringify(data.user))
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
}

export function roleRedirect(role: Role): string {
  if (role === "librarian") return "/librarian/dashboard"
  if (role === "student") return "/student/dashboard"
  return "/guest/dashboard"
}
