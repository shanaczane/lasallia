"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchChatSessions, WEB_CHAT_SESSION_STORAGE_KEY, type ChatSessionSummary } from "@/lib/chat"

interface ChatSidebarProps {
  open: boolean
  onClose?: () => void
}

const SUGGESTIONS = [
  "Find a book by topic",
  "Check library hours",
  "How to borrow a book",
  "Shelf locations guide",
  "Contact the librarian",
]

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return "today"
  if (days === 1) return "1d ago"
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

// Web-only "Recent Chats" (Chatbot Phase 7) — requires login, so this
// simply renders nothing for a guest rather than an empty/broken list.
// Not rendered at all on the kiosk assistant page (nothing to list —
// kiosk history is gone the moment the session ends).
export default function ChatSidebar({ open, onClose }: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])

  useEffect(() => {
    fetchChatSessions().then(setSessions).catch(() => setSessions([]))
  }, [])

  function startNewChat() {
    sessionStorage.removeItem(WEB_CHAT_SESSION_STORAGE_KEY)
    window.location.reload()
  }

  function openSession(id: string) {
    sessionStorage.setItem(WEB_CHAT_SESSION_STORAGE_KEY, id)
    window.location.reload()
  }

  return (
    <aside
      className={cn(
        "flex flex-col w-[280px] bg-white border-r overflow-hidden",
        // Desktop (lg+): always in flow
        "lg:shrink-0 lg:static lg:translate-x-0",
        // Mobile+tablet (<lg): fixed overlay below the 64px top nav
        "max-lg:fixed max-lg:top-16 max-lg:bottom-0 max-lg:left-0 max-lg:z-30",
        "max-lg:transition-transform max-lg:duration-200 max-lg:ease-in-out",
        // Show / hide
        open
          ? "flex max-lg:translate-x-0"          // always flex; overlay slides in on mobile
          : "hidden lg:flex max-lg:-translate-x-full", // hidden on mobile, always on desktop
      )}
      style={{ borderColor: "var(--color-ink-200)" }}
    >
      {/* ── New chat button ── */}
      <div
        className="shrink-0 p-3 border-b"
        style={{ borderColor: "var(--color-ink-100)" }}
      >
        <button
          type="button"
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors hover:bg-ink-50"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--color-ink-700)",
            borderColor: "var(--color-ink-200)",
          }}
        >
          <Plus size={15} />
          New chat
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2">

        {sessions.length > 0 && (
          <>
            {/* RECENT CHATS — 11px, tracking 0.08em, uppercase, ink-400, mb-2, mt-6 */}
            <p
              className="mt-6 mb-2 uppercase font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.08em", color: "var(--color-ink-400)" }}
            >
              Recent Chats
            </p>
            <ul className="space-y-0.5">
              {sessions.map((s) => (
                <li key={s.id}>
                  {/* px-3 py-2, title ink-900 14px, timestamp ink-400 12px, flex justify-between */}
                  <button
                    type="button"
                    onClick={() => openSession(s.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-ink-50 text-left gap-2"
                  >
                    <span
                      className="truncate"
                      style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--color-ink-900)" }}
                    >
                      {s.last_message_preview ?? "New conversation"}
                    </span>
                    <span
                      className="shrink-0"
                      style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink-400)" }}
                    >
                      {relativeTime(s.started_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* SUGGESTIONS — same label style */}
        <p
          className="mt-6 mb-2 uppercase font-semibold"
          style={{ fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.08em", color: "var(--color-ink-400)" }}
        >
          Suggestions
        </p>
        <ul className="space-y-0.5">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              {/* px-3 py-1.5, ink-500 text, 14px, hover:ink-100 bg */}
              <button
                type="button"
                className="w-full text-left px-3 py-[6px] rounded-lg transition-colors hover:bg-ink-100"
                style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--color-ink-500)" }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
