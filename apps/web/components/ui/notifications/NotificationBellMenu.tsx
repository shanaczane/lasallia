// components/ui/notifications/NotificationBellMenu.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Notification } from "@lasallia/types"
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/notifications"
import { useNotifications } from "./NotificationContext"
import { notificationTypeConfig, fallbackNotificationConfig } from "./NotificationItemCard"

// How many of the newest notifications the dropdown previews before
// pointing to the full page.
const PREVIEW_LIMIT = 8

function formatRelative(isoString: string): string {
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })
}

type NotificationBellMenuProps = {
  count: number
  /** The role's full notifications page, linked from "View all". */
  href: string
}

export function NotificationBellMenu({ count, href }: NotificationBellMenuProps) {
  const router = useRouter()
  const { notifyChanged } = useNotifications()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"all" | "unread">("all")
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [error, setError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Fetch fresh every time it opens — the badge count is polled, the list
  // isn't, so a cached list could disagree with the number on the bell.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchNotifications()
      .then((list) => {
        if (cancelled) return
        setNotifications(list)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  async function markRead(id: string) {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? prev)
    try {
      await markNotificationRead(id)
    } catch {
      // best-effort — the row re-syncs on the next open
    }
    notifyChanged()
  }

  async function markAllRead() {
    setNotifications((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? prev)
    try {
      await markAllNotificationsRead()
    } catch {
      // best-effort
    }
    notifyChanged()
  }

  function openNotification(n: Notification) {
    if (!n.is_read) markRead(n.id)
    if (n.link) {
      setOpen(false)
      router.push(n.link)
    }
  }

  const unreadInList = notifications?.filter((n) => !n.is_read).length ?? 0
  const visible = (notifications ?? [])
    .filter((n) => view === "all" || !n.is_read)
    .slice(0, PREVIEW_LIMIT)

  const bodyText = { fontFamily: "var(--font-body)" }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 transition-colors",
          open && "bg-ink-100 text-ink-900",
        )}
      >
        <Bell size={17} />
        {count > 0 && (
          <span
            className="absolute top-1 right-1 flex items-center justify-center rounded-full bg-green-700 text-white ring-2 ring-white font-semibold"
            style={{ width: 15, height: 15, fontSize: "var(--text-2xs)", ...bodyText }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "flex flex-col bg-white border border-ink-200 rounded-(--radius) shadow-lg overflow-hidden",
            // Phone: full width under the nav. sm+: anchored to the bell.
            "fixed inset-x-2 top-[calc(var(--height-nav)+6px)]",
            "sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <p
              className="text-ink-900 font-semibold"
              style={{ fontSize: "var(--text-lg)", fontFamily: "var(--font-display)" }}
            >
              Notifications
            </p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadInList === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-(--radius-sm) text-green-700 font-medium hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              style={{ fontSize: "var(--text-sm)", ...bodyText }}
            >
              <CheckCheck size={14} />
              Mark all as read
            </button>
          </div>

          {/* All / Unread */}
          <div className="flex gap-1 px-3 pb-2 border-b border-ink-100">
            {(["all", "unread"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-(--radius-pill) font-medium transition-colors",
                  view === key ? "bg-green-50 text-green-800" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
                )}
                style={{ fontSize: "var(--text-sm)", ...bodyText }}
              >
                {key === "all" ? "All" : "Unread"}
                {key === "unread" && unreadInList > 0 && (
                  <span
                    className="flex items-center justify-center rounded-full min-w-4 h-4 px-1 bg-green-700 text-white font-semibold"
                    style={{ fontSize: "var(--text-2xs)" }}
                  >
                    {unreadInList}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[min(26rem,calc(100dvh-12rem))]">
            {notifications === null && !error ? (
              <div className="flex flex-col">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-4 py-3 animate-pulse">
                    <div className="size-7 rounded-full bg-ink-100 shrink-0" />
                    <div className="flex-1 space-y-2 py-0.5">
                      <div className="h-3 w-2/3 rounded bg-ink-100" />
                      <div className="h-3 w-full rounded bg-ink-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error && notifications === null ? (
              <p className="px-4 py-10 text-center text-ink-400" style={{ fontSize: "var(--text-sm-body)", ...bodyText }}>
                Couldn&apos;t load notifications
              </p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-ink-400">
                <Bell size={24} className="mb-2 opacity-30" />
                <p style={{ fontSize: "var(--text-sm-body)", ...bodyText }}>
                  {view === "unread" ? "You're all caught up" : "No notifications yet"}
                </p>
              </div>
            ) : (
              visible.map((n, i) => {
                const config = notificationTypeConfig[n.type] ?? fallbackNotificationConfig
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50",
                      !n.is_read && "bg-green-50/50",
                      i < visible.length - 1 && "border-b border-ink-100",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 shrink-0 flex items-center justify-center rounded-full size-7",
                        config.iconBg,
                        config.iconColor,
                      )}
                    >
                      {config.icon()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn("leading-snug truncate", n.is_read ? "text-ink-600" : "text-ink-900 font-semibold")}
                        style={{ fontSize: "var(--text-sm-body)", ...bodyText }}
                      >
                        {n.title}
                      </p>
                      <p
                        className="text-ink-500 mt-0.5 leading-snug line-clamp-2"
                        style={{ fontSize: "var(--text-sm)", ...bodyText }}
                      >
                        {n.message}
                      </p>
                      <p className="text-ink-400 mt-1" style={{ fontSize: "var(--text-xs)", ...bodyText }}>
                        {formatRelative(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read && <span className="size-2 rounded-full bg-green-600 shrink-0 mt-1.5" />}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <Link
            href={href}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-ink-100 text-green-700 font-semibold hover:bg-green-50 transition-colors"
            style={{ fontSize: "var(--text-sm-body)", ...bodyText }}
          >
            View all notifications
            <ChevronRight size={15} />
          </Link>
        </div>
      )}
    </div>
  )
}
