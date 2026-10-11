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

// Sidebar badge count — self-fetches the real unread count rather than
// trusting a prop threaded down from a static layout.tsx, which can only
// ever be a guess about what's actually in the notifications table.
// `initialUnread` is just the pre-fetch render (avoids a 0->N flash for
// a returning user), immediately overwritten once the real count lands.
//
// Polled, not pushed — there's no websocket/Realtime subscription
// anywhere in this codebase (every notify()/notify_librarians() call is a
// plain synchronous DB insert, "no background job infra," same reality
// core/notify.py's own comments describe). Without this, a librarian
// with the app already open would only see a student's transaction after
// their next full navigation or reload; this is what makes it show up on
// its own instead.
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
