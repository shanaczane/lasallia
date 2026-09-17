// packages/types/notification.ts

export type NotificationType =
  | 'due_reminder'
  | 'overdue'
  | 'reservation_placed'          // student-facing: just joined a title's queue
  | 'reservation_queue_advanced'  // student-facing: now #1 in line, not ready yet
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'return_confirmed'
  | 'loan_confirmed'      // student-facing: a borrow just succeeded
  | 'student_activity'    // librarian-facing: one row per librarian, for every student transaction

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