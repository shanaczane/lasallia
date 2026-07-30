import { Book } from './book'

export type ReservationStatus = 'pending' | 'confirmed' | 'ready' | 'cancelled'

export type Reservation = {
  id: string
  user_id: string
  book_id: string
  requested_at: string
  confirmed_at?: string
  cancelled_at?: string
  pickup_by?: string
  status: ReservationStatus
  notes?: string
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
