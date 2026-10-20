"use client"

import { useState, useRef, useEffect, useLayoutEffect } from "react"
import { usePathname } from "next/navigation"
import ChatHeader from "./ChatHeader"
import ChatInput from "./ChatInput"
import ChatMessage, { type ChatMessageData } from "./ChatMessage"
import { DeleteChatModal } from "./DeleteChatModal"
import TypingIndicator, { type TypingStatus } from "./TypingIndicator"
import { sendChatMessage, fetchChatHistory, deleteChatSession, WEB_CHAT_SESSION_STORAGE_KEY, type ChatSource, type ChatSurface } from "@/lib/chat"
import type { BookCardData } from "./BookCard"
import type { SourceData } from "./SourceList"
import type { Book } from "@lasallia/types"
import { pillStatusFor } from "@/components/ui/pills/availability-pill"

interface ChatWindowProps {
  onMenuClick: () => void
  // Kiosk: sessionId is the station session's id. Web: the page picks the
  // open chat (undefined = not loaded yet, null = new chat).
  surface?: ChatSurface
  sessionId?: string | null
  // Web only — this window started a new conversation or deleted the open one.
  onSessionChange?: (id: string | null) => void
  // Web only — a conversation was created or deleted, so the sidebar's list is stale.
  onSessionsChanged?: () => void
}

const GREETING_TEXT = "Hi there! I'm Lasallia, your library assistant at De La Salle Lipa. I can help you find books and check availability. How can I help you today?"

// Marks that this kiosk visit has sent a message, so history is only
// loaded when there is some (otherwise the request would 404).
const KIOSK_CHAT_STARTED_KEY_PREFIX = "lasallia-kiosk-chat-started-"

// Chat history only has text, so each reply's book cards are saved here
// and matched back onto the history when it reloads.
const CHAT_BOOKS_KEY_PREFIX = "lasallia-chat-books-"

function readSavedBooks(sessionId: string): (BookCardData[] | null)[] {
  try { return JSON.parse(sessionStorage.getItem(`${CHAT_BOOKS_KEY_PREFIX}${sessionId}`) ?? "[]") } catch { return [] }
}

function appendSavedBooks(sessionId: string, books: BookCardData[] | null) {
  try {
    sessionStorage.setItem(`${CHAT_BOOKS_KEY_PREFIX}${sessionId}`, JSON.stringify([...readSavedBooks(sessionId), books]))
  } catch {}
}

function bookToCardData(book: Book, catalogBase: string): BookCardData {
  return {
    title: book.title,
    author: book.author,
    callNumber: book.call_number,
    availability: pillStatusFor(book),
    location: book.shelf_location,
    coverUrl: book.cover_url,
    // ?from=assistant makes the book page's Back link return to this chat.
    href: `${catalogBase}/${book.id}?from=assistant`,
  }
}

// A book record source links to the same page its card does.
function toSourceData(sources: ChatSource[] | undefined, catalogBase: string): SourceData[] | undefined {
  if (!sources || sources.length === 0) return undefined
  return sources.map((s) => (
    s.kind === "book" && s.book_id ? { ...s, href: `${catalogBase}/${s.book_id}?from=assistant` } : s
  ))
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function greeting(): ChatMessageData {
  return { id: "greeting", role: "bot", content: GREETING_TEXT, timestamp: timestamp() }
}

export default function ChatWindow({
  onMenuClick, surface = "web", sessionId, onSessionChange, onSessionsChanged,
}: ChatWindowProps) {
  // Starts empty; the greeting (with its timestamp) is added after mount to
  // avoid a hydration mismatch.
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [typingStatus, setTypingStatus] = useState<TypingStatus | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const sessionIdRef = useRef<string | null>(sessionId ?? null)
  // The chat on screen, so a late reply never lands in the wrong chat.
  const shownIdRef = useRef<string | null>(null)
  // Chats already opened, so switching back is instant.
  const cacheRef = useRef(new Map<string, ChatMessageData[]>())
  // Jump (not scroll) to the bottom when switching chats.
  const jumpScrollRef = useRef(true)
  // Whether the view is at the last message.
  const stickToBottomRef = useRef(true)
  const contentRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  // Book cards link to this portal's own catalog (user, guest or kiosk).
  const pathname = usePathname()
  const catalogBase =
    surface === "kiosk" ? "/kiosk/catalog"
    : pathname.startsWith("/guest") ? "/guest/catalog"
    : "/user/catalog"

  // Resets the whole window to whichever conversation was just picked, so
  // setting state here is the point of this effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Web: wait until the page has read the saved session id.
    if (surface === "web" && sessionId === undefined) return

    // Kiosk: only load history if a message was sent earlier this visit.
    const existingId =
      surface === "kiosk"
        ? (sessionId && sessionStorage.getItem(`${KIOSK_CHAT_STARTED_KEY_PREFIX}${sessionId}`) ? sessionId : null)
        : (sessionId ?? null)

    // This window just created the chat; its messages are already shown.
    if (existingId && existingId === shownIdRef.current) return

    let cancelled = false
    jumpScrollRef.current = true
    setTypingStatus(null)
    shownIdRef.current = existingId
    sessionIdRef.current = surface === "kiosk" ? (sessionId ?? null) : existingId
    setHasSession(!!existingId)

    if (!existingId) {
      setLoadingHistory(false)
      setMessages([greeting()])
      return
    }

    const cached = cacheRef.current.get(existingId)
    if (cached) {
      setLoadingHistory(false)
      setMessages(cached)
      return
    }

    async function hydrate(id: string) {
      setMessages([])
      setLoadingHistory(true)
      try {
        const history = await fetchChatHistory(id)
        if (cancelled) return
        if (history.length === 0) {
          setMessages([greeting()])
          return
        }
        // Match from the end, in case the history is shortened at the start.
        const savedBooks = readSavedBooks(id)
        let replyIndex = savedBooks.length - history.filter((m) => m.role === "assistant").length
        setMessages(
          history.map((m, i) => ({
            id: `history-${i}`,
            role: m.role === "assistant" ? "bot" : "user",
            content: m.content,
            timestamp: timestamp(),
            books: m.role === "assistant" ? (savedBooks[replyIndex++] ?? undefined) : undefined,
            sources: m.role === "assistant" ? toSourceData(m.sources, catalogBase) : undefined,
          }))
        )
      } catch {
        if (!cancelled) setMessages([greeting()])
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    }

    hydrate(existingId)
    return () => { cancelled = true }
    // Only reload when the chat changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, sessionId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep the cache in step with what's on screen.
  useEffect(() => {
    const id = shownIdRef.current
    if (id && messages.length > 0) cacheRef.current.set(id, messages)
  }, [messages])

  // Layout effect, so a switched chat opens at the bottom with no jump.
  useLayoutEffect(() => {
    // Scroll only the message list, not the page.
    const list = messagesRef.current
    if (!list) return
    if (jumpScrollRef.current) {
      list.scrollTop = list.scrollHeight
      stickToBottomRef.current = true
    } else {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" })
    }
    if (messages.length > 0) jumpScrollRef.current = false
  }, [messages, typingStatus])

  // Stay at the bottom while book covers load and make messages taller.
  useEffect(() => {
    const list = messagesRef.current
    const content = contentRef.current
    if (!list || !content) return
    const onScroll = () => {
      stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80
    }
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) list.scrollTop = list.scrollHeight
    })
    list.addEventListener("scroll", onScroll, { passive: true })
    observer.observe(content)
    return () => {
      list.removeEventListener("scroll", onScroll)
      observer.disconnect()
    }
  }, [])

  async function handleSend(text: string) {
    const sentFrom = shownIdRef.current
    const userMsg: ChatMessageData = {
      id: String(Date.now()),
      role: "user",
      content: text,
      timestamp: timestamp(),
    }
    setMessages((prev) => [...prev, userMsg])
    setTypingStatus("writing")

    await sendChatMessage(text, sessionIdRef.current, {
      onStatus: (status) => { if (shownIdRef.current === sentFrom) setTypingStatus(status) },
      onDone: (result) => {
        const books = result.books.length > 0 ? result.books.map((b) => bookToCardData(b, catalogBase)) : undefined
        appendSavedBooks(result.session_id, books ?? null)
        if (surface === "kiosk") sessionStorage.setItem(`${KIOSK_CHAT_STARTED_KEY_PREFIX}${result.session_id}`, "1")

        // The user switched chats; drop the cached copy so it reloads with the reply.
        if (shownIdRef.current !== sentFrom) {
          cacheRef.current.delete(result.session_id)
          if (surface === "web" && sentFrom !== result.session_id) onSessionsChanged?.()
          return
        }

        shownIdRef.current = result.session_id
        sessionIdRef.current = result.session_id
        setHasSession(true)
        setTypingStatus(null)
        setMessages((prev) => [...prev, {
          id: String(Date.now() + 1),
          role: "bot",
          content: result.reply,
          timestamp: timestamp(),
          books,
          sources: toSourceData(result.sources, catalogBase),
        }])
        if (surface === "web") {
          sessionStorage.setItem(WEB_CHAT_SESSION_STORAGE_KEY, result.session_id)
          if (sentFrom !== result.session_id) {
            onSessionChange?.(result.session_id)
            onSessionsChanged?.()
          }
        }
      },
      onError: (message) => {
        if (shownIdRef.current !== sentFrom) return
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

  async function confirmDeleteCurrentChat() {
    setShowDeleteModal(false)
    const id = sessionIdRef.current
    if (!id) return
    await deleteChatSession(id).catch(() => {})
    try { sessionStorage.removeItem(`${CHAT_BOOKS_KEY_PREFIX}${id}`) } catch {}
    cacheRef.current.delete(id)
    shownIdRef.current = null
    sessionIdRef.current = null
    setHasSession(false)
    if (surface === "web") {
      sessionStorage.removeItem(WEB_CHAT_SESSION_STORAGE_KEY)
      onSessionChange?.(null)
      onSessionsChanged?.()
    }
    if (surface === "kiosk") sessionStorage.removeItem(`${KIOSK_CHAT_STARTED_KEY_PREFIX}${id}`)
    jumpScrollRef.current = true
    setMessages([greeting()])
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
      <ChatHeader
        onMenuClick={onMenuClick}
        canDelete={hasSession}
        onDeleteChat={() => setShowDeleteModal(true)}
      />
      <DeleteChatModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteCurrentChat}
      />

      {/* Messages — scrollable area */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-6 py-5"
        style={{ background: "var(--color-ink-50)" }}
      >
        <div ref={contentRef} className="space-y-5">
          {loadingHistory && (
            <p
              className="text-center pt-6"
              style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-ink-400)" }}
            >
              Loading conversation…
            </p>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} {...m} />
          ))}
          {typingStatus && <TypingIndicator status={typingStatus} />}
        </div>
      </div>

      <ChatInput onSend={handleSend} disabled={typingStatus !== null || loadingHistory} />
    </div>
  )
}
