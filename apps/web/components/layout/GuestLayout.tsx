// apps/web/components/layout/GuestLayout.tsx
"use client"

import { useState } from "react"
import { TopNav } from "./TopNav"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  BookOpen,
  Search,
  MessageSquare,
  LogIn,
} from "lucide-react"

type NavItem = {
  label: string
  icon: React.ReactNode
  href: string
  badge?: number
}

type NavSection = {
  title: string
  items: NavItem[]
}

const guestNav: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard",         icon: <LayoutDashboard size={16} />, href: "/guest/dashboard" },
      { label: "Catalog",           icon: <Search size={16} />,          href: "/guest/catalog" },
      { label: "Reservations",      icon: <BookOpen size={16} />,        href: "/guest/reservations" },
      { label: "Library Assistant", icon: <MessageSquare size={16} />,   href: "/guest/assistant" },
    ],
  },
]

type GuestLayoutProps = {
  children: React.ReactNode
  userName?: string
  userInitials?: string
}

export function GuestLayout({
  children,
  userName = "Guest",
  userInitials = "G",
}: GuestLayoutProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const sidebarContent = (
    <>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-5">
        {guestNav.map((section) => (
          <div key={section.title}>
            <p
              className="px-2 mb-1 text-ink-400 uppercase font-semibold"
              style={{
                fontSize: "var(--text-2xs)",
                letterSpacing: "var(--tracking-section)",
                fontFamily: "var(--font-body)",
              }}
            >
              {section.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors",
                        isActive
                          ? "bg-green-100 text-green-800 font-semibold"
                          : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                      )}
                    >
                      <span className={cn(isActive ? "text-green-700" : "text-ink-400")}>
                        {item.icon}
                      </span>
                      <span className="flex-1" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                        {item.label}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sign in */}
      <div className="p-3 border-t border-ink-100">
        <a
          href="/login"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-sm text-ink-500 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          <LogIn size={16} className="text-ink-400" />
          Sign in with DLSL
        </a>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-paper">
      <TopNav
        userName={userName}
        userInitials={userInitials}
        notificationCount={0}
        showNotifications={false}
        onMenuClick={() => setMenuOpen(true)}
      />

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed left-0 bottom-0 flex-col bg-white border-r border-ink-200 overflow-y-auto"
        style={{ top: "var(--height-nav)", width: "var(--width-side)" }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-150 md:hidden"
          onClick={() => setMenuOpen(false)}
          style={{ background: "rgba(0,0,0,0.4)" }}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-160 flex flex-col bg-white border-r border-ink-200 overflow-y-auto transition-transform duration-300 md:hidden",
          menuOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: "var(--width-side)" }}
      >
        <div className="flex items-center justify-between px-4 border-b border-ink-200" style={{ height: "var(--height-nav)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-sm bg-green-700 text-white font-bold"
              style={{ width: 32, height: 32, fontFamily: "var(--font-display)", fontSize: "1rem" }}
            >
              L
            </div>
            <p className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
              Smart Library
            </p>
          </div>
        </div>
        {sidebarContent}
      </aside>

      {/* Page content */}
      <main
        className="min-h-screen md:pl-(--width-side)"
        style={{ paddingTop: "var(--height-nav)" }}
      >
        <div className="w-full">{children}</div>
      </main>
    </div>
  )
}