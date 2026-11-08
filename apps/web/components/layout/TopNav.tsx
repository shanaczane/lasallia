"use client"

import { cloneElement, isValidElement, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, LogOut, Menu, Settings, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { clearSession, verifySessionActive } from "@/lib/auth"
import { displayName, shortName } from "@/lib/names"
import { NotificationBellMenu } from "@/components/ui/notifications/NotificationBellMenu"
import { RoleBadge } from "@/components/ui/patrons/RoleBadge"

// The role line under the name in the bar: the layout's RoleBadge as plain
// text. Anything else is left out of the bar (it still shows in the menu).
function inlineRole(userType: React.ReactNode): React.ReactNode {
  if (isValidElement<React.ComponentProps<typeof RoleBadge>>(userType) && userType.type === RoleBadge) {
    return cloneElement(userType, { variant: "text" })
  }
  return null
}

// How often an already-open tab re-checks whether its account is still
// active. Short enough that a librarian deactivating someone mid-session
// takes effect quickly, long enough not to hammer /auth/me.
const SESSION_CHECK_INTERVAL_MS = 45_000

type TopNavProps = {
  userName?: string
  userEmail?: string
  userInitials?: string
  /** The user's RoleBadge. Every layout passes one. */
  userType?: React.ReactNode
  notificationCount?: number
  notificationsHref?: string
  showNotifications?: boolean
  /** Whether the avatar opens a sign-out dropdown — off for signed-out roles like Guest. */
  showSignOut?: boolean
  onMenuClick?: () => void
  /** Where the logo lockup links to — defaults to each role's dashboard. */
  homeHref?: string
  /** Overrides the default clearSession()+redirect-to-/login sign-out —
   * used by the kiosk, where "sign out" means ending a tap-based station
   * session or a local guest-browsing session, neither of which is a
   * real auth session with anything to clear or a /login page to visit. */
  onSignOut?: () => void
  /** Optional dropdown links, additive — a role that doesn't pass one
   * simply doesn't get that menu item, so Librarian/Guest/Kiosk are
   * unaffected unless they opt in. */
  profileHref?: string
  settingsHref?: string
}

export function TopNav({
  userName = "User",
  userEmail = "",
  userInitials = "U",
  userType,
  notificationCount = 0,
  notificationsHref = "/user/notifications",
  showNotifications = true,
  showSignOut = true,
  onMenuClick,
  homeHref = "/",
  onSignOut,
  profileHref,
  settingsHref,
}: TopNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fullName = displayName(userName) || "User"
  const barName = shortName(userName) || "User"
  const roleText = inlineRole(userType)

  // TopNav renders on every authenticated page in all three role layouts,
  // so this one effect is enough to cover librarian, student, and guest
  // dashboards — a deactivated account gets signed out here, not just
  // refused on its next login.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const active = await verifySessionActive()
      if (!cancelled && !active) window.location.replace("/login?deactivated=1")
    }
    check()
    const interval = setInterval(check, SESSION_CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  function handleSignOut() {
    if (onSignOut) {
      onSignOut()
      return
    }
    clearSession()
    window.location.replace("/login")
  }

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

        <Link
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
        </Link>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Bell — dropdown preview with a "View all" link to the full page */}
        {showNotifications && (
          <NotificationBellMenu count={notificationCount} href={notificationsHref} />
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-ink-200 mx-1.5 hidden sm:block" aria-hidden="true" />

        {/* Avatar + sign-out dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => showSignOut && setMenuOpen((v) => !v)}
            aria-haspopup={showSignOut ? "menu" : undefined}
            aria-expanded={showSignOut ? menuOpen : undefined}
            aria-label={showSignOut ? `Account menu for ${fullName}` : undefined}
            title={fullName}
            className={cn(
              "flex items-center gap-2.5 py-1 pl-1 pr-1 sm:pr-2 rounded-(--radius-sm) text-left transition-colors",
              showSignOut && "hover:bg-ink-100 active:bg-ink-200 cursor-pointer"
            )}
          >
            <div
              className="flex items-center justify-center rounded-full bg-green-100 text-green-800 font-semibold ring-1 ring-green-200 shrink-0"
              style={{ width: 36, height: 36, fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
            >
              {userInitials}
            </div>
            {/* Name over the role line; on phones the menu shows both. */}
            <div className="hidden sm:flex flex-col min-w-0 max-w-48 gap-0.5">
              <span
                className="text-ink-900 font-semibold truncate leading-tight"
                style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
              >
                {barName}
              </span>
              {roleText}
            </div>
            {showSignOut && (
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={cn("hidden sm:block text-ink-400 shrink-0 transition-transform", menuOpen && "rotate-180")}
              />
            )}
          </button>

          {showSignOut && menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-56 bg-white border border-ink-200 rounded-(--radius) shadow-lg overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-ink-100">
                <p
                  className="text-ink-900 font-semibold"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  {fullName}
                </p>
                {userEmail && (
                  <p
                    className="text-ink-400 truncate mt-0.5"
                    style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)" }}
                  >
                    {userEmail}
                  </p>
                )}
                {userType && <div className="flex mt-2">{userType}</div>}
              </div>
              {profileHref && (
                <Link
                  href={profileHref}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-ink-700 hover:bg-ink-50 transition-colors"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  <User size={16} className="text-ink-400" />
                  Profile
                </Link>
              )}
              {settingsHref && (
                <Link
                  href={settingsHref}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-ink-700 hover:bg-ink-50 transition-colors"
                  style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
                >
                  <Settings size={16} className="text-ink-400" />
                  Settings
                </Link>
              )}
              {(profileHref || settingsHref) && <div className="border-t border-ink-100" />}
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-ink-500 hover:bg-ink-50 hover:text-red-600 transition-colors"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
              >
                <LogOut size={16} className="text-ink-400" />
                Sign out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  )
}
