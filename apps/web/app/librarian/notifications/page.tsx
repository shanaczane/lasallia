// apps/web/app/librarian/notifications/page.tsx
"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { AlertCircle, Bookmark, Check, Bell } from "lucide-react"
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/notifications"
import { useNotifications } from "@/components/ui/notifications/NotificationContext"
import type { Notification, NotificationType } from "@lasallia/types"

// The real notifications table only has these 5 event types (0001_core_schema.sql)
// — no "system" category exists, since nothing in this codebase generates
// system/backup-style events. Grouped into the same 3 display buckets the
// librarian view used before, minus that invented 4th one.
type LibCategory = "overdue" | "reservation" | "return"

function categoryOf(type: NotificationType): LibCategory | null {
  if (type === "due_reminder" || type === "overdue") return "overdue"
  if (type === "reservation_confirmed" || type === "reservation_cancelled") return "reservation"
  if (type === "return_confirmed") return "return"
  return null
}

const ICON_CONFIG: Record<LibCategory, { icon: React.ReactNode; bg: string }> = {
  overdue:     { icon: <AlertCircle size={16} className="text-danger" />, bg: "bg-danger-bg" },
  reservation: { icon: <Bookmark size={16} className="text-info" />,      bg: "bg-info-bg" },
  return:      { icon: <Check size={16} className="text-success" />,      bg: "bg-success-bg" },
}

type TabKey = "all" | LibCategory

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "reservation", label: "Reservations" },
  { key: "return", label: "Returns" },
]

function groupByDate(items: Notification[]) {
  const groups: Record<string, Notification[]> = {}
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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const { refresh } = useNotifications()

  useEffect(() => {
    fetchNotifications()
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const categorized = notifications
    .map((n) => ({ n, category: categoryOf(n.type) }))
    .filter((x): x is { n: Notification; category: LibCategory } => x.category !== null)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const filtered =
    activeTab === "all" ? categorized : categorized.filter((x) => x.category === activeTab)

  const tabCounts: Record<TabKey, number> = {
    all: categorized.filter((x) => !x.n.is_read).length,
    overdue: categorized.filter((x) => !x.n.is_read && x.category === "overdue").length,
    reservation: categorized.filter((x) => !x.n.is_read && x.category === "reservation").length,
    return: categorized.filter((x) => !x.n.is_read && x.category === "return").length,
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await markNotificationRead(id)
      refresh()
    } catch {
      // best-effort
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      await markAllNotificationsRead()
      refresh()
    } catch {
      // best-effort
    }
  }

  const groups = groupByDate(filtered.map((x) => x.n))

  if (loading) return null

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
            Overdue items, reservation activity, and returns
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
                    const category = categoryOf(n.type) ?? "return"
                    const cfg = ICON_CONFIG[category]
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
