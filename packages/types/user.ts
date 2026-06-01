export type UserRole = 'student' | 'faculty' | 'librarian' | 'guest'

export type UserProfile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  program?: string
  year_level?: number
  avatar_url?: string
  created_at: string
}