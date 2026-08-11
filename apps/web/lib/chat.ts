// apps/web/lib/chat.ts
// Chatbot Phase 2 — fetch layer for POST /chat/message. The endpoint
// streams Server-Sent Events (status updates, then a final "done" event),
// which rules out the browser's EventSource (GET-only) — read the
// response body as a stream and parse SSE frames by hand instead.

import { getToken } from "@/lib/auth"
import type { Book } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// Shared between ChatWindow (reads/writes on send) and ChatSidebar
// (reads/writes on "New chat" / picking a past conversation) — web only,
// kiosk never touches sessionStorage for chat (see ChatWindow's own note).
export const WEB_CHAT_SESSION_STORAGE_KEY = "lasallia_chat_session_id"

export type ChatStatus = "searching" | "writing"

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type ChatDone = {
  reply: string
  books: Book[]
  session_id: string
}

export type ChatCallbacks = {
  onStatus?: (status: ChatStatus) => void
  onDone: (result: ChatDone) => void
  onError: (message: string) => void
}

export type ChatSurface = "kiosk" | "web"

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  callbacks: ChatCallbacks,
  surface: ChatSurface = "web"
): Promise<void> {
  const token = getToken()
  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}/chat/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, session_id: sessionId, surface }),
    })
  } catch {
    callbacks.onError("Could not reach Lasallia — check your connection and try again.")
    return
  }

  if (!res.ok || !res.body) {
    callbacks.onError("Lasallia is unavailable right now — please try again in a moment.")
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line; each frame is
    // "event: <name>\ndata: <json>".
    let sepIndex: number
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)

      const eventLine = frame.split("\n").find((l) => l.startsWith("event:"))
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"))
      if (!eventLine || !dataLine) continue

      const event = eventLine.slice("event:".length).trim()
      const data = JSON.parse(dataLine.slice("data:".length).trim())

      if (event === "status") callbacks.onStatus?.(data.status)
      else if (event === "done") callbacks.onDone(data)
      else if (event === "error") callbacks.onError(data.detail ?? "Something went wrong.")
    }
  }
}

// Chatbot Phase 7 — web-only "Recent Chats." Requires login: there's no
// persistent identity to list sessions by for a guest.
export type ChatSessionSummary = {
  id: string
  started_at: string
  last_message_preview: string | null
}

export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  const res = await fetch(`${API_URL}/chat/sessions`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error("Failed to load your recent chats")
  return res.json()
}

// Hydrates a page on load/refresh (web), or loads a fresh empty history
// for a brand-new kiosk session id. A guest-created web session is
// fetchable by anyone with its exact id (no auth needed — the id itself
// is the credential, matching this codebase's soft_holds/station_sessions
// pattern); a logged-in student's session additionally requires their
// token to match, enforced server-side.
export async function fetchChatHistory(sessionId: string): Promise<ChatMessage[]> {
  const token = getToken()
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(`${API_URL}/chat/sessions/${sessionId}`, { headers })
  if (res.status === 404) return []
  if (!res.ok) throw new Error("Failed to load this conversation")
  const data = await res.json()
  return data.messages
}
