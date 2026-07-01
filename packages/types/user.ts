export type UserRole = 'student' | 'faculty' | 'librarian' | 'guest'

export type UserAccountStatus = 'active' | 'inactive'

export type UserProfile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  program?: string
  year_level?: number
  avatar_url?: string
  status?: UserAccountStatus
  created_at: string
}