// app/librarian/notifications/page.tsx
'use client'

import { useState } from 'react'
import { NotificationFeed } from '@/components/ui/notifications/NotificationFeed'
import type { Notification } from '@lasallia/types'

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    user_id: 'librarian-1',
    type: 'overdue',
    title: 'Overdue alert: 5 items',
    message: '5 books are now overdue. Review the overdue list and follow up with borrowers.',
    is_read: false,
    created_at: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
  },
  {
    id: '2',
    user_id: 'librarian-1',
    type: 'reservation_confirmed',
    title: 'New reservation request',
    message: 'Maria Santos placed a hold on "Introduction to Algorithms". Confirm or reject in the Reservations queue.',
    is_read: false,
    created_at: new Date(new Date().setHours(8, 15, 0, 0)).toISOString(),
  },
  {
    id: '3',
    user_id: 'librarian-1',
    type: 'due_reminder',
    title: '3 books due today',
    message: '"Operating System Concepts", "Database System Concepts", and 1 more are due today and have not been returned.',
    is_read: false,
    created_at: new Date(new Date().setHours(7, 30, 0, 0)).toISOString(),
  },
  {
    id: '4',
    user_id: 'librarian-1',
    type: 'reservation_cancelled',
    title: 'Reservation expired',
    message: 'The pickup window for Juan dela Cruz\'s reservation of "Data Structures" has passed. The copy has been released.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(17, 0, 0, 0); return d.toISOString() })(),
  },
  {
    id: '5',
    user_id: 'librarian-1',
    type: 'overdue',
    title: 'Inventory warning: low copies',
    message: '"Clean Code" has 0 available copies out of 3 total. Consider requesting additional copies.',
    is_read: true,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 3); d.setHours(10, 0, 0, 0); return d.toISOString() })(),
  },
]

export default function LibrarianNotificationsPage() {
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