// apps/web/components/layout/TopNav.tsx
"use client"

import { Bell, Menu } from "lucide-react"

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

        {/* Bell */}
        {showNotifications && (
          <a
            href={notificationsHref}
            className="relative flex items-center justify-center w-8 h-8 rounded-sm text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
            aria-label="Notifications"
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
          </a>
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