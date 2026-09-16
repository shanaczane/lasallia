// apps/web/app/librarian/notifications/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { AlertCircle, Bookmark, BookOpen, RotateCcw, PackageCheck, Bell } from "lucide-react"
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/notifications"
import { useNotifications } from "@/components/ui/notifications/NotificationContext"
import type { Notification } from "@lasallia/types"

// Every librarian-facing row core/notify.py inserts comes in as one type,
// "student_activity" (notify_librarians loops one insert per librarian,
// for every student/guest transaction — checkout, return, reshelving,
// reservation placed/cancelled/picked up). The other NotificationType
// values (due_reminder, overdue, reservation_confirmed/cancelled,
// return_confirmed, loan_confirmed) are only ever written to a *student's*
// user_id — see loans.py/reservations.py's notify() call sites — so they
// can't actually reach this page today. Bucketing everything as one
// generic "Student Activity" feed made three of five tabs permanently
// empty; instead, sub-categorize student_activity rows by title keyword
// (the titles notify_librarians() sends are a small fixed set) so the
// tabs mirror the Borrow & Return page's own Borrow/Return/Reshelving
// split. The student-facing types are still mapped, defensively, in case
// this account ever legitimately receives one.
type LibCategory = "borrow" | "return" | "reshelving" | "reservation" | "other"

function titleCategory(title: string): LibCategory {
  const t = title.toLowerCase()
  if (t.includes("reshelved")) return "reshelving"
  if (t.includes("checked out") || t.includes("picked up")) return "borrow"
  if (t.includes("reshelving")) return "return"
  if (t.includes("reserv")) return "reservation"
  return "other"
}

function categoryOf(n: Notification): LibCategory {
  switch (n.type) {
    case "loan_confirmed":          return "borrow"
    case "return_confirmed":        return "return"
    case "reservation_confirmed":
    case "reservation_cancelled":   return "reservation"
    case "student_activity":        return titleCategory(n.title)
    default:                        return "other" // due_reminder / overdue
  }
}

const ICON_CONFIG: Record<LibCategory, { icon: React.ReactNode; bg: string }> = {
  borrow:      { icon: <BookOpen size={16} className="text-info" />,      bg: "bg-info-bg" },
  return:      { icon: <RotateCcw size={16} className="text-success" />,  bg: "bg-success-bg" },
  reshelving:  { icon: <PackageCheck size={16} className="text-ink-600" />, bg: "bg-ink-100" },
  reservation: { icon: <Bookmark size={16} className="text-warn" />,      bg: "bg-warn-bg" },
  other:       { icon: <AlertCircle size={16} className="text-ink-500" />, bg: "bg-ink-100" },
}

type TabKey = "all" | LibCategory

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "borrow", label: "Borrow" },
  { key: "return", label: "Return" },
  { key: "reshelving", label: "Reshelving" },
  { key: "reservation", label: "Reservations" },
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
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const { refresh } = useNotifications()

  // Polled every 20s (same interval as the sidebar bell's NotificationContext,
  // and the same reason — no websocket/Realtime in this codebase, so a
  // librarian who already has this page open otherwise never sees a
  // student's transaction land here until they reload) — silent after the
  // first load, so it doesn't flash back to the "Loading…" state.
  useEffect(() => {
    function load() {
      fetchNotifications()
        .then(setNotifications)
        .catch(() => {})
        .finally(() => setLoading(false))
    }
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [])

  const categorized = notifications.map((n) => ({ n, category: categoryOf(n) }))

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const filtered =
    activeTab === "all" ? categorized : categorized.filter((x) => x.category === activeTab)

  const tabCounts: Record<TabKey, number> = {
    all: categorized.filter((x) => !x.n.is_read).length,
    borrow: categorized.filter((x) => !x.n.is_read && x.category === "borrow").length,
    return: categorized.filter((x) => !x.n.is_read && x.category === "return").length,
    reshelving: categorized.filter((x) => !x.n.is_read && x.category === "reshelving").length,
    reservation: categorized.filter((x) => !x.n.is_read && x.category === "reservation").length,
    other: categorized.filter((x) => !x.n.is_read && x.category === "other").length,
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

  // Every notify()/notify_librarians() call already sets a link to the
  // relevant screen (e.g. the Reshelving tab, or Reservations) — nothing
  // used it before this, so a librarian had to read the message, then go
  // find the screen themselves. Marking read is fire-and-forget, same as
  // markRead already was; navigation doesn't wait on it.
  function openNotification(n: Notification) {
    markRead(n.id)
    if (n.link) router.push(n.link)
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
            Checkouts, returns, reshelving, and reservation activity — click one to jump to that screen
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
                    const cfg = ICON_CONFIG[categoryOf(n)]
                    return (
                      <button
                        key={n.id}
                        onClick={() => openNotification(n)}
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
