import { Book } from './book'

// Matches apps/api/schemas/recommendation.py exactly (Phase 5 of the
// recommendations build plan) — GET /recommendations/me's real response
// shape, not a placeholder.
export type RecommendationItem = {
  book: Book
  rank: number
  score: number
  reason: string
  // null for rung 2-4 fallback items (Phase 7) — nothing a single book
  // the student engaged with, unlike a personal (rung 1) recommendation.
  reason_book_id: string | null
}

export type RecommendationsResponse = {
  recommendations: RecommendationItem[]
  // null when the student has no stored recommendations at all (no
  // borrow history yet) — distinct from an empty list after live
  // exclusions removed everything that was stored.
  generated_at: string | null
  // Which rung of the Phase 7 fallback ladder produced this response —
  // picks the section header/subtitle without parsing `reason` strings.
  rung: "personal" | "program" | "popular"
}
