import { Book } from './book'

// Matches apps/api/schemas/recommendation.py.
export type RecommendationItem = {
  book: Book
  rank: number
  score: number
  reason: string
  // null for program and popular picks (not tied to one of the student's books).
  reason_book_id: string | null
}

export type RecommendationsResponse = {
  recommendations: RecommendationItem[]
  // null when there are no stored recommendations at all.
  generated_at: string | null
  // Which list this came from, for the section subtitle.
  rung: "personal" | "program" | "popular"
}
