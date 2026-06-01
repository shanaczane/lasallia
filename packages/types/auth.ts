import { UserProfile } from './user'

export type AuthSession = {
  user: UserProfile
  access_token: string
  refresh_token: string
}

export type AuthError = {
  message: string
  status: number
}
