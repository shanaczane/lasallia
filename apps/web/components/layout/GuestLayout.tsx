// apps/web/components/layout/GuestLayout.tsx
"use client"

import { TopNav } from "./TopNav"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  BookOpen,
  Search,
  Bell,
  MessageSquare,
  Bookmark,
  Clock,
  Library,
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
      { label: "Notifications",     icon: <Bell size={16} />,            href: "/guest/notifications" },
    ],
  },
  {
    title: "My Library",
    items: [
      { label: "Borrowed Books", icon: <Library size={16} />,  href: "/guest/borrowed" },
      { label: "Saved",          icon: <Bookmark size={16} />, href: "/guest/saved" },
      { label: "History",        icon: <Clock size={16} />,    href: "/guest/history" },
    ],
  },
]

type GuestLayoutProps = {
  children: React.ReactNode
  userName?: string
  userInitials?: string
  notificationCount?: number
}

export function GuestLayout({
  children,
  userName = "Guest",
  userInitials = "G",
  notificationCount = 0,
}: GuestLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-paper">
      <TopNav
        userName={userName}
        userInitials={userInitials}
        notificationCount={notificationCount}
      />

      {/* Sidebar */}
      <aside
        className="fixed left-0 bottom-0 flex flex-col bg-white border-r border-ink-200 overflow-y-auto"
        style={{ top: "var(--height-nav)", width: "var(--width-side)" }}
      >
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
              href="/guest/assistant"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm border border-green-600 text-white hover:bg-green-700 transition-colors"
              style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}
            >
              Chat now →
            </a>
          </div>
        </div>
      </aside>

      {/* Page content */}
      <main
        className="min-h-screen"
        style={{ paddingTop: "var(--height-nav)", paddingLeft: "var(--width-side)" }}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}