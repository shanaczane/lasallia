"use client"

import { createContext, useContext, useState } from "react"

type NotificationContextType = {
  unreadCount: number
  markAllRead: () => void
  markRead: () => void
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  markAllRead: () => {},
  markRead: () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

export function NotificationProvider({
  children,
  initialUnread = 0,
}: {
  children: React.ReactNode
  initialUnread?: number
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnread)

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        markAllRead: () => setUnreadCount(0),
        markRead: () => setUnreadCount((p) => Math.max(0, p - 1)),
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
