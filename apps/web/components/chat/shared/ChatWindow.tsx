"use client"

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react"
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
  quickRepliesSlot?: (onSelect: (text: string) => void) => ReactNode
  // Chatbot Phase 7 — surface governs history retention, not capability.
  // Kiosk always supplies sessionId (the station session's own id, from
  // KioskSessionProvider) since that IS the chat session for that visit.
  // Web: the page owns which conversation is open (so the sidebar can
  // switch it without a reload) and keeps it in sessionStorage so a
  // refresh can still find it. undefined = not read yet, null = new chat.
  surface?: ChatSurface
  sessionId?: string | null
  // Web only — this window started a new conversation or deleted the open one.
  onSessionChange?: (id: string | null) => void
  // Web only — a conversation was created or deleted, so the sidebar's list is stale.
  onSessionsChanged?: () => void
}

const GREETING_TEXT = "Hi there! I'm Lasallia, your library assistant at De La Salle Lipa. I can help you find books and check availability. How can I help you today?"

// A kiosk chat session's id is the station session's own id (always
// present, tap-in to walk-away), unlike web's — so there's no natural
// "no id yet" signal for "this visitor hasn't actually said anything".
// Without this, hydrate() below would call fetchChatHistory() for every
// kiosk visit, including the very first message of a brand-new session,
// which is guaranteed to 404 since chat_sessions rows are only created on
// the first POST /chat/message. Tracked in sessionStorage (not state) so
// it survives a navigate-away-and-back within the same station session.
const KIOSK_CHAT_STARTED_KEY_PREFIX = "lasallia-kiosk-chat-started-"

// Chat history (GET /chat/sessions/{id}) only replays message text, so the
// book cards would vanish when a visitor clicks one and comes back. Each
// reply's cards are kept per session in sessionStorage — one entry per
// saved assistant reply (failed turns are never saved server-side, so they
// get no entry either) — and matched back onto the history on hydrate.
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
  onMenuClick, quickRepliesSlot, surface = "web", sessionId, onSessionChange, onSessionsChanged,
}: ChatWindowProps) {
  // Empty until mount, not [greeting()] — a timestamp computed at module
  // load time runs once during SSR and again on the client, producing two
  // different strings and a hydration mismatch. Adding it in an effect
  // keeps the very first render (server and client) identical.
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [typingStatus, setTypingStatus] = useState<TypingStatus | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const sessionIdRef = useRef<string | null>(sessionId ?? null)
  // The session whose messages are on screen right now. A reply that lands
  // after the student has switched to another chat checks this so it never
  // shows up in the wrong conversation.
  const shownIdRef = useRef<string | null>(null)
  // Conversations already opened this visit, so switching back to one is
  // instant instead of refetching its history.
  const cacheRef = useRef(new Map<string, ChatMessageData[]>())
  // A conversation switch jumps straight to the newest message; only new
  // messages within the same chat scroll smoothly.
  const jumpScrollRef = useRef(true)
  // Whether the student is at (or near) the last message — see the
  // ResizeObserver effect below.
  const stickToBottomRef = useRef(true)
  const contentRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  // Shared by the student (faculty too), guest and kiosk assistants — each
  // card opens that portal's own book page. Sprint 5.4
  const pathname = usePathname()
  const catalogBase =
    surface === "kiosk" ? "/kiosk/catalog"
    : pathname.startsWith("/guest") ? "/guest/catalog"
    : "/student/catalog"

  // Resets the whole window to whichever conversation was just picked, so
  // setting state here is the point of this effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Web: the page reads the saved session id after mount and passes it
    // down — undefined means it hasn't yet.
    if (surface === "web" && sessionId === undefined) return

    // Kiosk: the id is fixed to this visit's station session, but only
    // worth fetching if a message was actually sent earlier this same
    // visit (navigated to catalog, came back) — otherwise there's
    // nothing server-side to find yet.
    const existingId =
      surface === "kiosk"
        ? (sessionId && sessionStorage.getItem(`${KIOSK_CHAT_STARTED_KEY_PREFIX}${sessionId}`) ? sessionId : null)
        : (sessionId ?? null)

    // This window just created the session itself (first reply of a new
    // chat) — its messages are already on screen.
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
        // Aligned from the end, so a history that was trimmed at the
        // start still lines up with the newest replies' cards.
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
    // Only re-hydrate if the underlying session identity actually
    // changes (picking another chat, a kiosk swap to a new station
    // session) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, sessionId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep the cache in step with what's on screen.
  useEffect(() => {
    const id = shownIdRef.current
    if (id && messages.length > 0) cacheRef.current.set(id, messages)
  }, [messages])

  // A layout effect, so a switched-to conversation is already at its last
  // message on the first frame drawn — a plain effect paints it at the top
  // first and then jumps.
  useLayoutEffect(() => {
    // Scrolls the message list only — scrollIntoView would also scroll the
    // page itself (the kiosk shell adds its own top padding around this).
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

  // Book covers load after the messages are drawn and make them taller,
  // which would leave the view short of the last message. While the
  // student is at the bottom, keep it there as the content grows.
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

        // Switched to another chat while this reply was being written —
        // drop the stale cached copy so reopening it refetches the reply.
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

      {/* Quick replies slot (optional) */}
      {quickRepliesSlot && quickRepliesSlot(handleSend)}

      <ChatInput onSend={handleSend} disabled={typingStatus !== null || loadingHistory} />
    </div>
  )
}
