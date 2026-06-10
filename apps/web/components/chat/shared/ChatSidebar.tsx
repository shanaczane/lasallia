"use client"

import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatSidebarProps {
  open: boolean
  onClose?: () => void
}

const RECENT_SESSIONS = [
  { id: "1", title: "Library hours & locations", time: "2d ago"  },
  { id: "2", title: "Available CS textbooks",    time: "3d ago"  },
  { id: "3", title: "Book renewal process",      time: "1w ago"  },
  { id: "4", title: "How to access e-journals",  time: "2w ago"  },
]

const SUGGESTIONS = [
  "Find a book by topic",
  "Check library hours",
  "How to borrow a book",
  "Shelf locations guide",
  "Contact the librarian",
]

export default function ChatSidebar({ open, onClose }: ChatSidebarProps) {
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

        {/* RECENT CHATS — 11px, tracking 0.08em, uppercase, ink-400, mb-2, mt-6 */}
        <p
          className="mt-6 mb-2 uppercase font-semibold"
          style={{ fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.08em", color: "var(--color-ink-400)" }}
        >
          Recent Chats
        </p>
        <ul className="space-y-0.5">
          {RECENT_SESSIONS.map((s) => (
            <li key={s.id}>
              {/* px-3 py-2, title ink-900 14px, timestamp ink-400 12px, flex justify-between */}
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-ink-50 text-left gap-2"
              >
                <span
                  className="truncate"
                  style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--color-ink-900)" }}
                >
                  {s.title}
                </span>
                <span
                  className="shrink-0"
                  style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-ink-400)" }}
                >
                  {s.time}
                </span>
              </button>
            </li>
          ))}
        </ul>

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
