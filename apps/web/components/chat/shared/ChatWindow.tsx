"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import ChatHeader from "./ChatHeader"
import ChatInput from "./ChatInput"
import ChatMessage, { type ChatMessageData } from "./ChatMessage"

interface ChatWindowProps {
  onMenuClick: () => void
  quickRepliesSlot?: (onSelect: (text: string) => void) => ReactNode
}

const MOCK_MESSAGES: ChatMessageData[] = [
  {
    id: "1",
    role: "bot",
    content: "Hi there! I'm Lasallia, your library assistant at De La Salle Lipa. I can help you find books, check availability, learn about library policies, and more. How can I help you today?",
    timestamp: "9:00 AM",
  },
  {
    id: "2",
    role: "user",
    content: "Is Clean Code available?",
    timestamp: "9:01 AM",
  },
  {
    id: "3",
    role: "bot",
    content: "Great choice! I found Clean Code in our catalog:",
    timestamp: "9:01 AM",
    book: {
      title: "Clean Code: A Handbook of Agile Software Craftsmanship",
      author: "Robert C. Martin",
      callNumber: "QA76.73.339 M37 2009",
      availability: "available",
      location: "Main LRC · Shelf 3B",
    },
  },
]

export default function ChatWindow({ onMenuClick, quickRepliesSlot }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>(MOCK_MESSAGES)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSend(text: string) {
    const newMsg: ChatMessageData = {
      id: String(Date.now()),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }
    setMessages((prev) => [...prev, newMsg])
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
        <div ref={bottomRef} />
      </div>

      {/* Quick replies slot (optional) */}
      {quickRepliesSlot && quickRepliesSlot(handleSend)}

      <ChatInput onSend={handleSend} />
    </div>
  )
}
