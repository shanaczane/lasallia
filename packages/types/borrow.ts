import { Book } from './book'

export type BorrowStatus = 'active' | 'returned' | 'overdue'

export type BorrowTransaction = {
  id: string
  user_id: string
  book_id: string
  borrowed_at: string
  due_date: string
  returned_at?: string
  status: BorrowStatus
  fine_amount?: number
  /** Embedded via the books FK — present when the API selects it. */
  books?: Book
  /** Embedded via the user_id FK — the borrowing patron (id/email/full_name/role only). */
  profiles?: {
    id: string
    email: string
    full_name?: string
    role: string
  }
}
