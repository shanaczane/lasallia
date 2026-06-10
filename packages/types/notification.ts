// packages/types/notification.ts

export type NotificationType =
  | 'due_reminder'
  | 'overdue'
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'return_confirmed'

export type Notification = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  created_at: string
  /** Optional — links the notification to a related screen */
  link?: string
}