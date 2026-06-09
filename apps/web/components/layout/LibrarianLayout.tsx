// apps/web/components/layout/LibrarianLayout.tsx
"use client"

import { useState } from "react"
import { TopNav } from "./TopNav"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  BookOpen,
  ScanLine,
  RotateCcw,
  BarChart2,
  Library,
  Users,
  Tag,
  Settings,
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

const librarianNav: NavSection[] = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard",       icon: <LayoutDashboard size={16} />, href: "/librarian/dashboard" },
      { label: "Borrow & Return", icon: <ScanLine size={16} />,        href: "/librarian/borrow-return" },
      { label: "Renewals",        icon: <RotateCcw size={16} />,       href: "/librarian/renewals",     badge: 3 },
      { label: "Reservations",    icon: <BookOpen size={16} />,        href: "/librarian/reservations", badge: 7 },
      { label: "Reports",         icon: <BarChart2 size={16} />,       href: "/librarian/reports" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Catalog",    icon: <Library size={16} />,  href: "/librarian/catalog" },
      { label: "Patrons",    icon: <Users size={16} />,    href: "/librarian/patrons" },
      { label: "Categories", icon: <Tag size={16} />,      href: "/librarian/categories" },
      { label: "Settings",   icon: <Settings size={16} />, href: "/librarian/settings" },
    ],
  },
]

type LibrarianLayoutProps = {
  children: React.ReactNode
  userName?: string
  userInitials?: string
  notificationCount?: number
}

export function LibrarianLayout({
  children,
  userName,
  userInitials,
  notificationCount,
}: LibrarianLayoutProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const sidebarContent = (
    <>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-5">
        {librarianNav.map((section) => (
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
                      {item.badge !== undefined && (
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-full min-w-4.5 h-4.5 px-1",
                            isActive ? "bg-green-700 text-white" : "bg-ink-200 text-ink-500"
                          )}
                          style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-body)" }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Need help CTA */}
      <div className="p-3">
        <div className="rounded-(--radius) p-4 bg-green-800">
          <p className="text-white font-semibold mb-0.5" style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}>
            Need help?
          </p>
          <p className="text-green-200 mb-3" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
            Ask Lasallia, our library assistant, anything.
          </p>
          <a
            href="/librarian/assistant"
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm border border-green-600 text-white hover:bg-green-700 transition-colors"
            style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
          >
            Chat now →
          </a>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-paper">
      <TopNav
        userName={userName}
        userInitials={userInitials}
        notificationCount={notificationCount}
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
        style={{ width: "var(--width-side)", paddingTop: "var(--height-nav)" }}
      >
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