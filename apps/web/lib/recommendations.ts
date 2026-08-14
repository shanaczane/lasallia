// apps/web/lib/recommendations.ts
// Fetch layer for GET /recommendations/me — the "For You" dashboard
// section (recommendations plan Phase 6). Backend does all the scoring
// offline (Phase 5); this is a plain authenticated GET.

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

// Recommendations plan Phase 7, rung 0 — fully public, no auth. Same
// response shape as fetchRecommendations, so callers that just want
// "whatever's best available" can try one then the other without a
// separate rendering path.
export async function fetchPopularRecommendations(limit = 8): Promise<RecommendationsResponse> {
  const res = await fetch(`${API_URL}/recommendations/popular?limit=${limit}`)
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load popular books")
  return res.json()
}
