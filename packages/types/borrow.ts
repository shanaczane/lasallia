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
}
