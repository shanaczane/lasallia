// app/guest/notifications/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { NotificationFeed } from '@/components/ui/notifications/NotificationFeed'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/notifications'
import type { Notification } from '@lasallia/types'

export default function GuestNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNotifications()
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await markNotificationRead(id)
    } catch {
      // best-effort
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      await markAllNotificationsRead()
    } catch {
      // best-effort
    }
  }

  if (loading) return null

  return (
    <NotificationFeed
      notifications={notifications}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
    />
  )
}
