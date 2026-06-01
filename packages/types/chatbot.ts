export type ChatMessageRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  role: ChatMessageRole
  content: string
  created_at: string
}

export type ChatbotLog = {
  id: string
  user_id?: string
  query: string
  response: string
  matched_rule?: string
  used_nlp: boolean
  created_at: string
}