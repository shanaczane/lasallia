// apps/web/lib/recommendationEvents.ts
// Recommendations plan Phase 9 — click-through logging for the "For
// You" section. Every call here is fire-and-forget: a failed log write
// must never break the dashboard, so nothing here throws or is awaited
// by its caller.

import { getToken } from "@/lib/auth"
import type { RecommendationItem } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const SESSION_KEY = "lasallia_rec_session_id"

// Guest funnel attribution only — meaningless (and unused server-side)
// once a caller is logged in, but harmless to always send.
function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

type EventType = "impression" | "click" | "reserve" | "dismiss"

async function post(events: { event_type: EventType; book_id: string; rank?: number }[]): Promise<void> {
  const token = getToken()
  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    // Always send session_id, even alongside a token — a stale/expired
    // token still passes the truthy check here but gets silently treated
    // as anonymous server-side (get_optional_user swallows the 401), so
    // omitting session_id whenever *a* token merely exists left the
    // backend with neither a valid user nor a session_id to rate-limit
    // against, which 400s. The backend already prefers a valid user over
    // session_id when both are present, so sending both is never wrong.
    await fetch(`${API_URL}/recommendations/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events, session_id: getOrCreateSessionId() }),
    })
  } catch {
    // Logging is best-effort — a network hiccup here shouldn't surface
    // to the student in any way.
  }
}

// One batched call per section render, not one per card — matches the
// plan's own "batch impressions" instruction.
export function logImpressions(items: RecommendationItem[]): void {
  if (items.length === 0) return
  void post(items.map((item) => ({ event_type: "impression", book_id: item.book.id, rank: item.rank })))
}

export function logEvent(type: Exclude<EventType, "impression">, bookId: string, rank?: number): void {
  void post([{ event_type: type, book_id: bookId, rank }])
}
