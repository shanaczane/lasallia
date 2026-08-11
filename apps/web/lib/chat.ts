// apps/web/lib/chat.ts
// Chatbot Phase 2 — fetch layer for POST /chat/message. The endpoint
// streams Server-Sent Events (status updates, then a final "done" event),
// which rules out the browser's EventSource (GET-only) — read the
// response body as a stream and parse SSE frames by hand instead.

import { getToken } from "@/lib/auth"
import type { Book } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type ChatStatus = "searching" | "writing"

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

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  callbacks: ChatCallbacks
): Promise<void> {
  const token = getToken()
  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}/chat/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, session_id: sessionId }),
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
