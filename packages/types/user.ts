export type UserRole = 'student' | 'faculty' | 'librarian' | 'guest'

export type UserAccountStatus = 'active' | 'inactive'

export type UserProfile = {
  id: string
  email: string
  // May be null: not every account has a name.
  full_name: string | null
  role: UserRole
  // School-issued student/faculty number, unique. May be missing.
  id_number?: string
  program?: string
  // A college code (apps/web/lib/colleges.ts). If missing, the frontend
  // guesses it from `program`.
  college?: string
  year_level?: number
  avatar_url?: string
  status?: UserAccountStatus
  created_at: string
}