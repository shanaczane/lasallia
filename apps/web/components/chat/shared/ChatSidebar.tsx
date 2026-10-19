"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { DeleteChatModal } from "./DeleteChatModal"
import { useDialogKeyboard } from "@/lib/hooks/useDialogKeyboard"
import { fetchChatSessions, deleteChatSession, type ChatSessionSummary } from "@/lib/chat"

interface ChatSidebarProps {
  open: boolean
  onClose?: () => void
  // The conversation open in the chat window (null = a new, unsaved chat).
  activeSessionId?: string | null
  // Opens a conversation in place — null starts a new chat.
  onSelectSession: (id: string | null) => void
  // Bumped by the page when a conversation is created or deleted elsewhere.
  refreshKey?: number
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return "today"
  if (days === 1) return "1d ago"
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

// "Recent Chats" on the web (logged-in users only). Not used on the kiosk.
export default function ChatSidebar({ open, onClose, activeSessionId, onSelectSession, refreshKey }: ChatSidebarProps) {
  // Below lg the sidebar slides over the chat like a drawer: Esc closes it
  // and Tab stays inside. At lg+ it's a normal always-visible column.
  const asideRef = useRef<HTMLElement>(null)
  const isOverlay = typeof window !== "undefined" && window.matchMedia("(max-width: 1023.98px)").matches
  useDialogKeyboard(asideRef, { open: open && isOverlay, onClose })
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    fetchChatSessions().then(setSessions).catch(() => setSessions([]))
  }, [refreshKey])

  async function confirmDelete() {
    const id = deleteTarget
    setDeleteTarget(null)
    if (!id) return
    await deleteChatSession(id).catch(() => {})
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionId === id) onSelectSession(null)
  }

  return (
    <aside
      ref={asideRef}
      aria-label="Recent chats"
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
          onClick={() => onSelectSession(null)}
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
            {/* RECENT CHATS heading */}
            <p
              className="mt-6 mb-2 uppercase font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.08em", color: "var(--color-ink-400)" }}
            >
              Recent Chats
            </p>
            <ul className="space-y-0.5">
              {sessions.map((s) => (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    aria-current={s.id === activeSessionId ? "true" : undefined}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 pr-8 rounded-lg transition-colors hover:bg-ink-50 text-left gap-2",
                      s.id === activeSessionId && "bg-ink-50",
                    )}
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
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.id) }}
                    aria-label="Delete this chat"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-md text-ink-300 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-danger-bg hover:text-danger transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <DeleteChatModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </aside>
  )
}
