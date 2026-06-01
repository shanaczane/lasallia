import { Book } from './book'

export type Recommendation = {
  book: Book
  similarity_score: number
  reason?: string
}

export type RecommendationResponse = {
  recommendations: Recommendation[]
  based_on: 'borrowing_history' | 'search_history' | 'interests' | 'program'
}