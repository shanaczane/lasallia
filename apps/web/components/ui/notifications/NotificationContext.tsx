"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { fetchNotifications } from "@/lib/notifications"

type NotificationContextType = {
  unreadCount: number
  markAllRead: () => void
  markRead: () => void
  refresh: () => void
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  markAllRead: () => {},
  markRead: () => {},
  refresh: () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

// Sidebar badge count — self-fetches the real unread count rather than
// trusting a prop threaded down from a static layout.tsx, which can only
// ever be a guess about what's actually in the notifications table.
// `initialUnread` is just the pre-fetch render (avoids a 0->N flash for
// a returning user), immediately overwritten once the real count lands.
export function NotificationProvider({
  children,
  initialUnread = 0,
}: {
  children: React.ReactNode
  initialUnread?: number
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnread)

  function refresh() {
    fetchNotifications()
      .then((notifs) => setUnreadCount(notifs.filter((n) => !n.is_read).length))
      .catch(() => {})
  }

  useEffect(refresh, [])

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        markAllRead: () => setUnreadCount(0),
        markRead: () => setUnreadCount((p) => Math.max(0, p - 1)),
        refresh,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
