// apps/web/components/layout/GuestLayout.tsx
"use client"

import { useState, useEffect, useLayoutEffect } from "react"

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect
import { TopNav } from "./TopNav"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  BookOpen,
  Search,
  MessageSquare,
  LogIn,
  ChevronLeft,
  ChevronRight,
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
  const [collapsed, setCollapsed] = useState(false)

  useLayoutEffectSafe(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed))
  }, [collapsed])

  const renderSidebarContent = (isCollapsed: boolean) => (
    <>
      <nav className={cn("flex-1 py-4 flex flex-col gap-5", isCollapsed ? "px-1" : "px-3")}>
        {guestNav.map((section) => (
          <div key={section.title}>
            {!isCollapsed && (
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
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center transition-colors rounded-sm",
                        isCollapsed
                          ? "justify-center p-2 mx-1"
                          : "gap-2.5 px-2 py-1.5",
                        isActive
                          ? "bg-green-100 text-green-800 font-semibold"
                          : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                      )}
                    >
                      <span className={cn(isActive ? "text-green-700" : "text-ink-400")}>
                        {item.icon}
                      </span>
                      {!isCollapsed && (
                        <span className="flex-1" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sign in */}
      <div className={cn("border-t border-ink-100", isCollapsed ? "p-2" : "p-3")}>
        <a
          href="/login"
          title={isCollapsed ? "Sign in with DLSL" : undefined}
          className={cn(
            "flex items-center rounded-sm text-ink-500 hover:bg-ink-50 hover:text-ink-900 transition-colors",
            isCollapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2"
          )}
          style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
        >
          <LogIn size={16} className="text-ink-400" />
          {!isCollapsed && "Sign in with DLSL"}
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
        showSignOut={false}
        homeHref="/guest/dashboard"
        onMenuClick={() => setMenuOpen(true)}
      />

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex fixed left-0 bottom-0 flex-col bg-white border-r border-ink-200 overflow-y-auto transition-all duration-200"
        style={{ top: "var(--height-nav)", width: collapsed ? 56 : "var(--width-side)" }}
      >
        {/* Collapse toggle */}
        <div className={cn("shrink-0 flex border-b border-ink-100", collapsed ? "justify-center p-2" : "justify-end p-2")}>
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center w-7 h-7 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
        {renderSidebarContent(collapsed)}
      </aside>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-150 md:hidden"
          onClick={() => setMenuOpen(false)}
          style={{ background: "rgba(0,0,0,0.4)" }}
        />
      )}

      {/* Mobile drawer — always expanded */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-160 flex flex-col bg-white border-r border-ink-200 overflow-y-auto transition-transform duration-300 md:hidden",
          menuOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: "var(--width-side)" }}
      >
        <div className="flex items-center justify-between px-4 border-b border-ink-200" style={{ height: "var(--height-nav)" }}>
          <Link href="/guest/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-full bg-white border border-ink-200 shrink-0"
              style={{ width: 34, height: 34, boxShadow: "var(--shadow-sm)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/DeLaSalleLipa_Seal.png"
                alt="De La Salle Lipa"
                className="object-contain"
                style={{ width: 25, height: 25, mixBlendMode: "multiply" }}
              />
            </div>
            <p className="text-ink-900 font-bold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-base)" }}>
              Lasallia
            </p>
          </Link>
        </div>
        {renderSidebarContent(false)}
      </aside>

      {/* Page content */}
      <main
        className={cn(
          "min-h-screen transition-all duration-200",
          collapsed ? "md:pl-14" : "md:pl-(--width-side)"
        )}
        style={{ paddingTop: "var(--height-nav)" }}
      >
        <div className="w-full">{children}</div>
      </main>
    </div>
  )
}
