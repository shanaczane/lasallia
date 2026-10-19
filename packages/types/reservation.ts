import { Book } from './book'

// 'ready' is set automatically when a copy is free. 'fulfilled' = picked
// up (became a loan). 'expired' = not picked up in time.
export type ReservationStatus = 'pending' | 'ready' | 'fulfilled' | 'cancelled' | 'expired'

export type Reservation = {
  id: string
  user_id: string
  book_id: string
  book_copy_id?: string       // set once a specific copy is assigned (status 'ready'+)
  requested_at: string
  confirmed_at?: string       // when this became 'ready'
  cancelled_at?: string
  fulfilled_at?: string
  pickup_by?: string
  status: ReservationStatus
  notes?: string
  queue_position?: number     // computed on read, only meaningful while 'pending'
  estimated_ready_at?: string // rough date a copy should be ready — a student's own 'pending' rows only
  /** Embedded via the books FK — present when the API selects it. */
  books?: Book
  /** Embedded via the user_id FK — the requesting patron (id/email/full_name/role only). */
  profiles?: {
    id: string
    email: string
    full_name?: string
    role: string
  }
}
