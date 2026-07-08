// apps/web/app/librarian/notifications/page.tsx
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { AlertCircle, Bookmark, Check, Settings, Bell } from "lucide-react"

type LibNotifType = "overdue" | "reservation" | "return" | "system"

type LibNotification = {
  id: string
  type: LibNotifType
  title: string
  message: string
  is_read: boolean
  created_at: string
}

const ICON_CONFIG: Record<LibNotifType, { icon: React.ReactNode; bg: string }> = {
  overdue:     { icon: <AlertCircle size={16} className="text-danger" />, bg: "bg-danger-bg" },
  reservation: { icon: <Bookmark size={16} className="text-info" />,      bg: "bg-info-bg" },
  return:      { icon: <Check size={16} className="text-success" />,      bg: "bg-success-bg" },
  system:      { icon: <Settings size={16} className="text-ink-500" />,   bg: "bg-ink-100" },
}

const MOCK: LibNotification[] = [
  {
    id: "1",
    type: "overdue",
    title: "3 borrowers are over 7 days overdue",
    message: 'Paolo Aguilar (2 books), Khatrina Gonzales (1 book), and Jed Sayat (1 book) have items past their due date by 7+ days. Consider sending a follow-up notice.',
    is_read: false,
    created_at: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
  },
  {
    id: "2",
    type: "reservation",
    title: "4 new reservation requests pending approval",
    message: 'Students have requested: "Clean Code" (×2), "Operating System Concepts" (×1), and "Artificial Intelligence: A Modern Approach" (×1). Review and confirm pickups.',
    is_read: false,
    created_at: new Date(new Date().setHours(8, 45, 0, 0)).toISOString(),
  },
  {
    id: "3",
    type: "return",
    title: "Batch return processed — 8 books checked in",
    message: '8 books were returned this morning via the drop box. Titles include: "Database System Concepts", "Operating System Concepts", and 6 others. Shelf re-shelving needed.',
    is_read: false,
    created_at: new Date(new Date().setHours(8, 12, 0, 0)).toISOString(),
  },
  {
    id: "4",
    type: "overdue",
    title: "Overdue reminder sent — Maria Santos",
    message: 'An automated reminder was sent to Maria L. Santos for "Computer Networks" (6th Ed.) and "The Pragmatic Programmer", both 5 days past due.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(16, 0, 0, 0); return d.toISOString() })(),
  },
  {
    id: "5",
    type: "reservation",
    title: "Pickup window expiring tomorrow — 2 holds",
    message: '"Designing Data-Intensive Applications" (Shan Cruz) and "Refactoring" (Paolo Aguilar) must be picked up by Nov 21 or the hold will be released.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(14, 30, 0, 0); return d.toISOString() })(),
  },
  {
    id: "6",
    type: "return",
    title: "Return confirmed — Khatrina Gonzales",
    message: '"Database System Concepts" returned in good condition. No fines applied. Item is now back in circulation.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(10, 31, 0, 0); return d.toISOString() })(),
  },
  {
    id: "7",
    type: "system",
    title: "Weekly backup completed",
    message: "System backup for the library database completed successfully. No issues detected.",
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 2); d.setHours(2, 0, 0, 0); return d.toISOString() })(),
  },
]

type TabKey = "all" | "overdue" | "reservation" | "return" | "system"

const TABS: { key: TabKey; label: string; type?: LibNotifType }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue", type: "overdue" },
  { key: "reservation", label: "Reservations", type: "reservation" },
  { key: "return", label: "Returns", type: "return" },
  { key: "system", label: "System", type: "system" },
]

function groupByDate(items: LibNotification[]) {
  const groups: Record<string, LibNotification[]> = {}
  for (const n of items) {
    const date = new Date(n.created_at)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const yest = new Date(now); yest.setDate(yest.getDate() - 1)
    const isYesterday = date.toDateString() === yest.toDateString()
    const label = isToday
      ? `Today · ${date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}`
      : isYesterday
      ? `Yesterday · ${date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}`
      : date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })
    if (!groups[label]) groups[label] = []
    groups[label].push(n)
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }))
}

export default function LibrarianNotificationsPage() {
  const [notifications, setNotifications] = useState<LibNotification[]>(MOCK)
  const [activeTab, setActiveTab] = useState<TabKey>("all")

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const filtered =
    activeTab === "all"
      ? notifications
      : notifications.filter((n) => n.type === activeTab)

  const tabCounts: Record<TabKey, number> = {
    all: notifications.filter((n) => !n.is_read).length,
    overdue: notifications.filter((n) => !n.is_read && n.type === "overdue").length,
    reservation: notifications.filter((n) => !n.is_read && n.type === "reservation").length,
    return: notifications.filter((n) => !n.is_read && n.type === "return").length,
    system: notifications.filter((n) => !n.is_read && n.type === "system").length,
  }

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const groups = groupByDate(filtered)

  return (
    <div className="flex flex-col w-full min-h-screen bg-paper">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-4 sm:px-8 pt-6 pb-4">
        <div>
          <h1
            className="text-ink-900 font-semibold leading-tight"
            style={{ fontSize: "var(--text-3xl)", fontFamily: "var(--font-display)" }}
          >
            Notifications
          </h1>
          <p
            className="text-ink-500 mt-1"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            Operational alerts — overdue items, reservations, and system activity
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="self-start sm:self-auto px-4 py-2 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Tab filters */}
      <div className="flex border-b border-ink-200 px-4 sm:px-8 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const count = tabCounts[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                isActive
                  ? "border-green-700 text-green-700"
                  : "border-transparent text-ink-500 hover:text-ink-900"
              )}
              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full min-w-5 h-5 px-1 font-semibold",
                    isActive ? "bg-green-700 text-white" : "bg-ink-200 text-ink-500"
                  )}
                  style={{ fontSize: "var(--text-2xs)" }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notification groups */}
      <div className="flex-1 px-4 sm:px-8 py-4">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-ink-400">
            <Bell size={28} className="mb-2 opacity-30" />
            <p style={{ fontSize: "var(--text-body)", fontFamily: "var(--font-body)" }}>
              No notifications here
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(({ label, items }) => (
              <div key={label} className="flex flex-col gap-2">
                <p
                  className="text-ink-400 uppercase font-semibold px-1"
                  style={{
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-body)",
                    letterSpacing: "var(--tracking-caps)",
                  }}
                >
                  {label}
                </p>

                <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
                  {items.map((n, i) => {
                    const cfg = ICON_CONFIG[n.type]
                    return (
                      <button
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-ink-50 transition-colors",
                          i < items.length - 1 && "border-b border-ink-100",
                          !n.is_read && "bg-green-50/50"
                        )}
                      >
                        <div className={cn("flex items-center justify-center rounded-full shrink-0 mt-0.5", cfg.bg)} style={{ width: 32, height: 32 }}>
                          {cfg.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn("text-ink-900 leading-snug", !n.is_read && "font-semibold")}
                              style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
                            >
                              {n.title}
                            </p>
                            <span className="text-ink-400 shrink-0 whitespace-nowrap" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                              {new Date(n.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-ink-500 mt-0.5 leading-snug" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-body)" }}>
                            {n.message}
                          </p>
                        </div>

                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-green-700 shrink-0 mt-1.5" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}