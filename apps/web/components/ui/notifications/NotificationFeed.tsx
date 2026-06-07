// components/ui/notifications/NotificationFeed.tsx
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { Notification, NotificationType } from "@lasallia/types"
import { NotificationItemCard } from "./NotificationItemCard"
import { Bell } from "lucide-react"

type TabKey = "all" | "due_dates" | "reservations" | "recommendations"

type Tab = {
  key: TabKey
  label: string
  types?: NotificationType[]
}

const TABS: Tab[] = [
  { key: "all", label: "All" },
  { key: "due_dates", label: "Due dates", types: ["due_reminder", "overdue"] },
  { key: "reservations", label: "Reservations", types: ["reservation_confirmed", "reservation_cancelled"] },
  { key: "recommendations", label: "Recommendations", types: ["return_confirmed"] },
]

function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const groups: Record<string, Notification[]> = {}

  for (const n of notifications) {
    const date = new Date(n.created_at)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()

    let label: string
    if (isToday) {
      label = `Today · ${date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}`
    } else if (isYesterday) {
      label = `Yesterday · ${date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}`
    } else {
      label = date.toLocaleDateString("en-PH", { month: "long", day: "numeric" })
    }

    if (!groups[label]) groups[label] = []
    groups[label].push(n)
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }))
}

type NotificationFeedProps = {
  notifications: Notification[]
  onMarkRead?: (id: string) => void
  onMarkAllRead?: () => void
}

export function NotificationFeed({
  notifications,
  onMarkRead,
  onMarkAllRead,
}: NotificationFeedProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const filtered =
    activeTab === "all"
      ? notifications
      : notifications.filter((n) => {
          const tab = TABS.find((t) => t.key === activeTab)
          return tab?.types?.includes(n.type)
        })

  const tabCounts: Record<TabKey, number> = {
    all: notifications.filter((n) => !n.is_read).length,
    due_dates: notifications.filter((n) => !n.is_read && ["due_reminder", "overdue"].includes(n.type)).length,
    reservations: notifications.filter((n) => !n.is_read && ["reservation_confirmed", "reservation_cancelled"].includes(n.type)).length,
    recommendations: notifications.filter((n) => !n.is_read && ["return_confirmed"].includes(n.type)).length,
  }

  const groups = groupByDate(filtered)

  return (
    <div className="flex flex-col w-full min-h-screen bg-paper">

      {/* Page header */}
      <div className="flex items-start justify-between px-8 pt-6 pb-4">
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
            Updates on your reservations, due dates, and recommendations
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="px-4 py-2 rounded-(--radius) border border-ink-200 bg-white text-ink-700 font-medium hover:bg-ink-50 transition-colors shadow-sm"
            style={{ fontSize: "var(--text-sm-body)", fontFamily: "var(--font-body)" }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Tab filters */}
      <div className="flex border-b border-ink-200 px-8">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const count = tabCounts[tab.key]
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 transition-colors -mb-px",
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
      <div className="flex-1 px-8 py-4">
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
                {/* Date label — outside cards */}
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

                {/* Cards grouped together in a rounded container */}
                <div className="bg-white rounded-(--radius) border border-ink-200 overflow-hidden">
                  {items.map((n, i) => (
                    <NotificationItemCard
                      key={n.id}
                      notification={n}
                      onMarkRead={onMarkRead}
                      isLast={i === items.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}