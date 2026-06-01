export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export type Reservation = {
  id: string
  user_id: string
  book_id: string
  requested_at: string
  confirmed_at?: string
  cancelled_at?: string
  status: ReservationStatus
  notes?: string
}