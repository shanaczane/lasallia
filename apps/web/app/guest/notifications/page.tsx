// app/guest/notifications/page.tsx
'use client'

import { useState } from 'react'
import { NotificationFeed } from '@/components/ui/notifications/NotificationFeed'
import type { Notification } from '@lasallia/types'

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    user_id: 'user-guest',
    type: 'reservation_confirmed',
    title: 'Your reserved book is ready for pickup',
    message: '"Designing Data-Intensive Applications" by Martin Kleppmann is waiting at the Main LRC desk. Pick up by Nov 21.',
    is_read: false,
    created_at: new Date(new Date().setHours(10, 42, 0, 0)).toISOString(),
  },
  {
    id: '2',
    user_id: 'user-guest',
    type: 'due_reminder',
    title: 'Book due in 2 days',
    message: '"Clean Code" — return by Nov 21 to avoid late fees. Renew online if you need more time.',
    is_read: false,
    created_at: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
  },
  {
    id: '3',
    user_id: 'user-guest',
    type: 'reservation_confirmed',
    title: 'Reservation confirmed',
    message: 'Your reservation for "The Pragmatic Programmer" has been confirmed. Pickup window: Nov 22–24.',
    is_read: false,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(15, 20, 0, 0); return d.toISOString() })(),
  },
  {
    id: '4',
    user_id: 'user-guest',
    type: 'return_confirmed',
    title: '3 new books match your interests',
    message: 'Based on your borrowing history, you might enjoy: "Building Microservices", "System Design Interview Vol. 2", and "Software Engineering at Google".',
    is_read: false,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(11, 15, 0, 0); return d.toISOString() })(),
  },
  {
    id: '5',
    user_id: 'user-guest',
    type: 'overdue',
    title: 'Overdue: 3 days',
    message: '"Calculus: Early Transcendentals" is overdue by 3 days. Please return it as soon as possible.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(9, 0, 0, 0); return d.toISOString() })(),
  },
  {
    id: '6',
    user_id: 'user-guest',
    type: 'reservation_cancelled',
    title: 'Reservation cancelled',
    message: 'Your reservation for "Engineering Mathematics" was cancelled because the pickup window passed.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 14); d.setHours(14, 30, 0, 0); return d.toISOString() })(),
  },
]

export default function GuestNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)

  function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  return (
    <NotificationFeed
      notifications={notifications}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
    />
  )
}