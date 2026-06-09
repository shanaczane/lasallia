// apps/web/components/layout/TopNav.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { Bell, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

type NotificationItem = {
  id: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    title: "Your reserved book is ready for pickup",
    message: '"Designing Data-Intensive Applications" is waiting at the Main LRC desk.',
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    title: "Book due in 2 days",
    message: '"Clean Code" — return by Nov 21 to avoid late fees.',
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    title: "Reservation confirmed",
    message: 'Your reservation for "The Pragmatic Programmer" has been confirmed.',
    is_read: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "4",
    title: "3 new books match your interests",
    message: 'Based on your borrowing history, you might enjoy "Building Microservices".',
    is_read: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "5",
    title: "Overdue: 3 days",
    message: '"Calculus: Early Transcendentals" is overdue. Please return it soon.',
    is_read: true,
    created_at: new Date().toISOString(),
  },
]

type TopNavProps = {
  userName?: string
  userInitials?: string
  notificationCount?: number
  notificationsHref?: string
  showNotifications?: boolean
  onMenuClick?: () => void
}

export function TopNav({
  userName = "User",
  userInitials = "U",
  notificationCount = 0,
  notificationsHref = "/student/notifications",
  showNotifications = true,
  onMenuClick,
}: TopNavProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleLogout() {
    window.location.replace('/loginView')
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 flex items-center justify-between px-5 bg-white border-b border-ink-200 z-(--z-nav)"
      style={{ height: "var(--height-nav)" }}
    >
      {/* Left: hamburger (mobile only) + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex md:hidden items-center justify-center w-8 h-8 rounded-sm text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-sm bg-green-700 text-white font-bold"
            style={{ width: 32, height: 32, fontFamily: "var(--font-display)", fontSize: "1rem" }}
          >
            L
          </div>
          <div className="leading-tight">
            <p
              className="text-ink-900 font-semibold"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              Smart Library
            </p>
            <p
              className="text-ink-400 uppercase hidden sm:block"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-2xs)",
                letterSpacing: "var(--tracking-eyebrow)",
              }}
            >
              De La Salle Lipa · LRC
            </p>
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">

        {/* Bell with dropdown */}
        {showNotifications && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="relative flex items-center justify-center w-8 h-8 rounded-sm text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
            >
              <Bell size={17} />
              {notificationCount > 0 && (
                <span
                  className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full bg-green-700 text-white"
                  style={{ width: 14, height: 14, fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
                >
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 bg-white border border-ink-200 rounded-(--radius) overflow-hidden z-[200]"
                style={{ width: 320, boxShadow: "var(--shadow-lg)" }}
              >
                {/* Dropdown header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
                  <p className="font-semibold text-ink-900" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                    Notifications
                  </p>
                  <button onClick={() => setDropdownOpen(false)}>
                    <X size={15} className="text-ink-400 hover:text-ink-900" />
                  </button>
                </div>

                {/* Notification items */}
                <div className="flex flex-col divide-y divide-ink-100">
                  {MOCK_NOTIFICATIONS.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        "px-4 py-3 flex gap-3 hover:bg-ink-50 transition-colors",
                        !n.is_read && "bg-green-50"
                      )}
                    >
                      {/* Unread dot */}
                      <div className="mt-1.5 shrink-0">
                        {!n.is_read
                          ? <div className="w-2 h-2 rounded-full bg-green-700" />
                          : <div className="w-2 h-2" />
                        }
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <p
                          className={cn("text-ink-900", !n.is_read && "font-semibold")}
                          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
                        >
                          {n.title}
                        </p>
                        <p
                          className="text-ink-500"
                          style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
                        >
                          {n.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* See all link */}
                <a
                  href={notificationsHref}
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center justify-center py-3 border-t border-ink-100 text-green-700 font-medium hover:bg-ink-50 transition-colors"
                  style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
                >
                  See all notifications →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Avatar */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center rounded-full bg-green-200 text-green-800 font-semibold"
            style={{ width: 30, height: 30, fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
          >
            {userInitials}
          </div>
          <span
            className="text-ink-700 font-medium hidden sm:block"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            {userName}
          </span>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className="flex items-center justify-center w-8 h-8 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-900 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  )
}