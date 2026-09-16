export type UserRole = 'student' | 'faculty' | 'librarian' | 'guest'

export type UserAccountStatus = 'active' | 'inactive'

export type UserProfile = {
  id: string
  email: string
  // Nullable — profiles created by Supabase Auth's signup trigger don't
  // require it, and it's not enforced anywhere at the database level.
  // Every reader must handle null, not assume a name was ever set.
  full_name: string | null
  role: UserRole
  program?: string
  year_level?: number
  avatar_url?: string
  status?: UserAccountStatus
  created_at: string
}