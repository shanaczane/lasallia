// apps/web/lib/chat.ts
// Chatbot Phase 2 — fetch layer for POST /chat/message. Matches
// lib/kiosk.ts's shape (thin wrappers, parseErrorOrThrow). Not
// implemented yet — routers/chat.py itself is still a scaffold.

import type { Book } from '@lasallia/types'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatResponse = {
  reply: string
  books: Book[] | null
  session_id: string
}

export async function sendChatMessage(message: string, sessionId?: string): Promise<ChatResponse> {
  throw new Error('Not implemented — Phase 2')
}
