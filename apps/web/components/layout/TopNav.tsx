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
  /** Where the logo lockup links to — defaults to each role's dashboard. */
  homeHref?: string
}

export function TopNav({
  userName = "User",
  userInitials = "U",
  notificationCount = 0,
  notificationsHref = "/student/notifications",
  showNotifications = true,
  onMenuClick,
  homeHref = "/",
}: TopNavProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white/95 backdrop-blur-sm border-b border-ink-200 z-(--z-nav)"
      style={{ height: "var(--height-nav)", boxShadow: "var(--shadow-sm)" }}
    >
      {/* Left: hamburger (mobile only) + logo */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="flex md:hidden items-center justify-center w-9 h-9 -ml-1 rounded-(--radius-sm) text-ink-500 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <a
          href={homeHref}
          className="group flex items-center gap-2.5 min-w-0 rounded-(--radius-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
        >
          <div
            className="flex items-center justify-center rounded-full bg-white border border-ink-200 shrink-0 transition-shadow duration-200 group-hover:shadow-(--shadow)"
            style={{ width: 40, height: 40, boxShadow: "var(--shadow-sm)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/DeLaSalleLipa_Seal.png"
              alt="De La Salle Lipa"
              className="object-contain"
              style={{ width: 30, height: 30, mixBlendMode: "multiply" }}
            />
          </div>
          <div className="leading-tight min-w-0">
            <p
              className="text-ink-900 font-bold truncate"
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}
            >
              Lasallia
            </p>
            <p
              className="text-ink-400 uppercase hidden sm:block truncate"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-2xs)",
                letterSpacing: "var(--tracking-eyebrow)",
              }}
            >
              De La Salle Lipa · LRC
            </p>
          </div>
        </a>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Bell */}
        {showNotifications && (
          <a
            href={notificationsHref}
            className="relative flex items-center justify-center w-9 h-9 rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={17} />
            {notificationCount > 0 && (
              <span
                className="absolute top-1 right-1 flex items-center justify-center rounded-full bg-green-700 text-white ring-2 ring-white font-semibold"
                style={{ width: 15, height: 15, fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
              >
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
          </a>
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-ink-200 mx-1.5 hidden sm:block" aria-hidden="true" />

        {/* Avatar */}
        <div className="flex items-center gap-2.5 py-1 pl-1 pr-1 sm:pr-2.5">
          <div
            className="flex items-center justify-center rounded-full bg-green-100 text-green-800 font-semibold ring-1 ring-green-200 shrink-0"
            style={{ width: 32, height: 32, fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
          >
            {userInitials}
          </div>
          <span
            className="text-ink-800 font-medium capitalize hidden sm:block truncate max-w-32"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            {userName}
          </span>
        </div>

      </div>
    </header>
  )
}
