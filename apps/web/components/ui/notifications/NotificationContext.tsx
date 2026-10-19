"use client"

import { createContext, useContext, useState } from "react"
import { fetchNotifications } from "@/lib/notifications"
import { usePolling } from "@/lib/hooks/usePolling"

type NotificationContextType = {
  unreadCount: number
  markAllRead: () => void
  markRead: () => void
  refresh: () => void
  /** Bumped whenever notifications change outside the page showing them
   * (e.g. marked read from the bell dropdown), so that page can refetch. */
  revision: number
  notifyChanged: () => void
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  markAllRead: () => {},
  markRead: () => {},
  refresh: () => {},
  revision: 0,
  notifyChanged: () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

// Unread count for the bell and sidebar badge, checked every minute so new
// notifications show up without a reload. `initialUnread` is shown until
// the first check.
const POLL_INTERVAL_MS = 60_000

export function NotificationProvider({
  children,
  initialUnread = 0,
}: {
  children: React.ReactNode
  initialUnread?: number
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnread)
  const [revision, setRevision] = useState(0)

  function refresh() {
    fetchNotifications()
      .then((notifs) => setUnreadCount(notifs.filter((n) => !n.is_read).length))
      .catch(() => {})
  }

  usePolling(refresh, POLL_INTERVAL_MS)

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        markAllRead: () => setUnreadCount(0),
        markRead: () => setUnreadCount((p) => Math.max(0, p - 1)),
        refresh,
        revision,
        notifyChanged: () => {
          setRevision((r) => r + 1)
          refresh()
        },
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
