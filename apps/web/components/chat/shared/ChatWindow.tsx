"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import ChatHeader from "./ChatHeader"
import ChatInput from "./ChatInput"
import ChatMessage, { type ChatMessageData } from "./ChatMessage"
import TypingIndicator, { type TypingStatus } from "./TypingIndicator"
import { sendChatMessage, fetchChatHistory, WEB_CHAT_SESSION_STORAGE_KEY, type ChatSurface } from "@/lib/chat"
import type { BookCardData } from "./BookCard"
import type { Book } from "@lasallia/types"

interface ChatWindowProps {
  onMenuClick: () => void
  quickRepliesSlot?: (onSelect: (text: string) => void) => ReactNode
  // Chatbot Phase 7 — surface governs history retention, not capability.
  // Kiosk always supplies sessionId (the station session's own id, from
  // KioskSessionProvider) since that IS the chat session for that visit.
  // Web manages its own, kept in sessionStorage so a refresh can still
  // find it (see WEB_CHAT_SESSION_STORAGE_KEY below); a brand-new tab/guest
  // just starts fresh, same as today.
  surface?: ChatSurface
  sessionId?: string
}

const GREETING_TEXT = "Hi there! I'm Lasallia, your library assistant at De La Salle Lipa. I can help you find books and check availability. How can I help you today?"

function bookToCardData(book: Book): BookCardData {
  return {
    title: book.title,
    author: book.author,
    callNumber: book.call_number,
    availability: book.status === "misplaced" ? "missing" : book.status,
    location: book.shelf_location,
  }
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function greeting(): ChatMessageData {
  return { id: "greeting", role: "bot", content: GREETING_TEXT, timestamp: timestamp() }
}

export default function ChatWindow({ onMenuClick, quickRepliesSlot, surface = "web", sessionId }: ChatWindowProps) {
  // Empty until mount, not [greeting()] — a timestamp computed at module
  // load time runs once during SSR and again on the client, producing two
  // different strings and a hydration mismatch. Adding it in an effect
  // keeps the very first render (server and client) identical.
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [typingStatus, setTypingStatus] = useState<TypingStatus | null>(null)
  const sessionIdRef = useRef<string | null>(sessionId ?? null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      // Kiosk: the id is fixed to this visit's station session — always
      // try to load it (a student may have chatted earlier this same
      // visit, navigated to catalog, and come back). Web: only if a
      // prior tab/refresh left an id behind.
      const existingId = surface === "kiosk" ? sessionId : sessionStorage.getItem(WEB_CHAT_SESSION_STORAGE_KEY)

      if (!existingId) {
        if (!cancelled) setMessages([greeting()])
        return
      }

      sessionIdRef.current = existingId
      try {
        const history = await fetchChatHistory(existingId)
        if (cancelled) return
        if (history.length === 0) {
          setMessages([greeting()])
          return
        }
        setMessages(
          history.map((m, i) => ({
            id: `history-${i}`,
            role: m.role === "assistant" ? "bot" : "user",
            content: m.content,
            timestamp: timestamp(),
          }))
        )
      } catch {
        if (!cancelled) setMessages([greeting()])
      }
    }

    hydrate()
    return () => { cancelled = true }
    // Only re-hydrate if the underlying session identity actually
    // changes (e.g. a kiosk swap to a new station session) — not on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typingStatus])

  async function handleSend(text: string) {
    const userMsg: ChatMessageData = {
      id: String(Date.now()),
      role: "user",
      content: text,
      timestamp: timestamp(),
    }
    setMessages((prev) => [...prev, userMsg])
    setTypingStatus("writing")

    await sendChatMessage(text, sessionIdRef.current, {
      onStatus: setTypingStatus,
      onDone: (result) => {
        sessionIdRef.current = result.session_id
        if (surface === "web") sessionStorage.setItem(WEB_CHAT_SESSION_STORAGE_KEY, result.session_id)
        setTypingStatus(null)
        setMessages((prev) => [...prev, {
          id: String(Date.now() + 1),
          role: "bot",
          content: result.reply,
          timestamp: timestamp(),
          books: result.books.length > 0 ? result.books.map(bookToCardData) : undefined,
        }])
      },
      onError: (message) => {
        setTypingStatus(null)
        setMessages((prev) => [...prev, {
          id: String(Date.now() + 1),
          role: "bot",
          content: message,
          timestamp: timestamp(),
        }])
      },
    }, surface)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
      <ChatHeader onMenuClick={onMenuClick} />

      {/* Messages — scrollable area */}
      <div
        className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        style={{ background: "var(--color-ink-50)" }}
      >
        {messages.map((m) => (
          <ChatMessage key={m.id} {...m} />
        ))}
        {typingStatus && <TypingIndicator status={typingStatus} />}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies slot (optional) */}
      {quickRepliesSlot && quickRepliesSlot(handleSend)}

      <ChatInput onSend={handleSend} disabled={typingStatus !== null} />
    </div>
  )
}
