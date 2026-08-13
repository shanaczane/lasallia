import { Book } from './book'

// Matches apps/api/schemas/recommendation.py exactly (Phase 5 of the
// recommendations build plan) — GET /recommendations/me's real response
// shape, not a placeholder.
export type RecommendationItem = {
  book: Book
  rank: number
  score: number
  reason: string
  reason_book_id: string
}

export type RecommendationsResponse = {
  recommendations: RecommendationItem[]
  // null when the student has no stored recommendations at all (no
  // borrow history yet) — distinct from an empty list after live
  // exclusions removed everything that was stored.
  generated_at: string | null
}
