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
  | 'fine_settled'        // student-facing: a librarian marked a previously-unsettled fine as paid
  | 'fine_reminder'       // student-facing: recurring nudge about a fine that's still unpaid
  | 'book_request_submitted'  // librarian-facing: a faculty member submitted a new book request
  | 'book_request_cancelled'  // librarian-facing: a faculty member withdrew their pending request
  | 'book_request_approved'   // faculty-facing: a librarian approved their request
  | 'book_request_rejected'   // faculty-facing: a librarian declined their request
  | 'book_request_fulfilled'  // faculty-facing: the requested title was acquired

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