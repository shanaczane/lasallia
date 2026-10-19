// API calls for "For You" recommendations.

import { getToken } from "@/lib/auth"
import type { RecommendationsResponse } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function fetchRecommendations(limit = 8): Promise<RecommendationsResponse> {
  const res = await fetch(`${API_URL}/recommendations/me?limit=${limit}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load recommendations")
  return res.json()
}

// Public popular list (no login). Same shape as fetchRecommendations.
export async function fetchPopularRecommendations(limit = 8): Promise<RecommendationsResponse> {
  const res = await fetch(`${API_URL}/recommendations/popular?limit=${limit}`)
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load popular books")
  return res.json()
}

// The kiosk's "For you" tab. The kiosk session identifies the student;
// guests get the popular list.
export async function fetchKioskRecommendations(sessionId: string | null, limit = 8): Promise<RecommendationsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (sessionId) params.set('session_id', sessionId)
  const res = await fetch(`${API_URL}/recommendations/kiosk?${params}`)
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load recommendations")
  return res.json()
}
