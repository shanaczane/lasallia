// Logs views and clicks on "For You" books. Never throws, so a logging
// failure can't break the dashboard.

import { getToken } from "@/lib/auth"
import type { RecommendationItem } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
const SESSION_KEY = "lasallia_rec_session_id"

// A random id per browser, used for guests.
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
    // Always send session_id too: an expired token is treated as a guest,
    // and the server needs session_id then.
    await fetch(`${API_URL}/recommendations/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ events, session_id: getOrCreateSessionId() }),
    })
  } catch {
    // Ignore logging errors.
  }
}

// One request for the whole row, not one per book.
export function logImpressions(items: RecommendationItem[]): void {
  if (items.length === 0) return
  void post(items.map((item) => ({ event_type: "impression", book_id: item.book.id, rank: item.rank })))
}

export function logEvent(type: Exclude<EventType, "impression">, bookId: string, rank?: number): void {
  void post([{ event_type: type, book_id: bookId, rank }])
}
