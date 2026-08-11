"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import ChatHeader from "./ChatHeader"
import ChatInput from "./ChatInput"
import ChatMessage, { type ChatMessageData } from "./ChatMessage"
import TypingIndicator, { type TypingStatus } from "./TypingIndicator"
import { sendChatMessage } from "@/lib/chat"
import type { BookCardData } from "./BookCard"
import type { Book } from "@lasallia/types"

interface ChatWindowProps {
  onMenuClick: () => void
  quickRepliesSlot?: (onSelect: (text: string) => void) => ReactNode
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

export default function ChatWindow({ onMenuClick, quickRepliesSlot }: ChatWindowProps) {
  // Empty until mount, not [GREETING] — a timestamp computed at module
  // load time runs once during SSR and again on the client, producing two
  // different strings and a hydration mismatch. Adding it in an effect
  // keeps the very first render (server and client) identical.
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [typingStatus, setTypingStatus] = useState<TypingStatus | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMessages([{ id: "greeting", role: "bot", content: GREETING_TEXT, timestamp: timestamp() }])
  }, [])

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
    })
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
