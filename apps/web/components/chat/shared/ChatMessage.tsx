"use client"

import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import BookCard, { BookCardData } from "./BookCard"

export interface ChatMessageData {
  id: string
  role: "user" | "bot"
  content: string
  timestamp: string
  book?: BookCardData
  restricted?: boolean
}

type Props = Omit<ChatMessageData, "id">

export default function ChatMessage({ role, content, timestamp, book, restricted }: Props) {
  const isUser = role === "user"

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>

      {/* Bot avatar — 32px */}
      {!isUser && (
        <div
          className="shrink-0 flex items-center justify-center rounded-full text-white font-bold self-start mt-0.5"
          style={{
            width: 32, height: 32,
            background: "var(--color-green-700)",
            fontFamily: "var(--font-display)",
            fontSize: 14,
          }}
        >
          L
        </div>
      )}

      <div
        className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
        style={{ maxWidth: isUser ? 400 : 520 }}
      >
        {/* Bubble — px-4 py-3, rounded-lg */}
        <div
          className={`px-4 py-3 rounded-lg ${isUser ? "rounded-tr-sm" : "rounded-tl-sm shadow-sm"}`}
          style={{
            background: isUser ? "var(--color-green-700)" : "white",
            color: isUser ? "white" : "var(--color-ink-900)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            border: isUser ? "none" : "1px solid var(--color-ink-100)",
          }}
        >
          {content}

          {book && <BookCard {...book} />}

          {restricted && (
            <div
              className="mt-3 rounded-lg p-3 space-y-2"
              style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Lock size={12} className="text-amber-600" />
                </div>
                <p className="font-semibold text-amber-800" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>
                  Members Only
                </p>
              </div>
              <p className="text-amber-700" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>
                Log in with your @dlsl.edu.ph account to unlock this feature.
              </p>
              <Button size="sm" className="w-full" onClick={() => (window.location.href = "/loginView")}>
                Login to continue
              </Button>
            </div>
          )}
        </div>

        {/* Timestamp — ink-400 11px */}
        <span
          className={isUser ? "text-right" : ""}
          style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--color-ink-400)" }}
        >
          {timestamp}
        </span>
      </div>
    </div>
  )
}
