"use client"

import { useEffect, useRef, useState } from "react"
import { Menu, MoreVertical, Trash2 } from "lucide-react"

interface ChatHeaderProps {
  onMenuClick: () => void
  canDelete: boolean
  onDeleteChat: () => void
}

export default function ChatHeader({ onMenuClick, canDelete, onDeleteChat }: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])

  return (
    // px-6 py-4, border-bottom ink-100
    <header
      className="shrink-0 flex items-center gap-3 px-6 py-4 bg-white border-b"
      style={{ borderColor: "var(--color-ink-100)" }}
    >
      {/* Hamburger — tablet only (md → lg) */}
      <button
        type="button"
        onClick={onMenuClick}
        className="hidden md:flex lg:hidden shrink-0 items-center justify-center w-8 h-8 rounded-md text-ink-500 hover:bg-ink-100 transition-colors"
        aria-label="Toggle chat sessions sidebar"
      >
        <Menu size={18} />
      </button>

      {/* Avatar — 40px green circle, online dot — 8px green-500 */}
      <div className="relative shrink-0">
        <div
          className="flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: 40, height: 40,
            background: "var(--color-green-700)",
            fontFamily: "var(--font-display)",
            fontSize: 16,
          }}
        >
          L
        </div>
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-white"
          style={{ width: 8, height: 8, background: "#22C55E" }}
        />
      </div>

      {/* Name — font-display 18px green-800 · Subtitle — ink-400 13px */}
      <div className="flex-1 min-w-0">
        <p
          className="leading-tight font-semibold"
          style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--color-green-800)" }}
        >
          Lasallia
        </p>
        <p
          className="leading-tight"
          style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-ink-400)" }}
        >
          Online · Hybrid AI + librarian support
        </p>
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-ink-400 hover:bg-ink-100 transition-colors"
          aria-label="More options"
          aria-expanded={menuOpen}
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-9 z-20 w-48 py-1.5 rounded-(--radius) bg-white border border-ink-200 shadow-(--shadow-lg)"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              disabled={!canDelete}
              onClick={() => { setMenuOpen(false); onDeleteChat() }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors text-danger hover:bg-danger-bg disabled:text-ink-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              <Trash2 size={14} />
              Delete this chat
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
