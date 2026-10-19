// Signs in and redirects by the role the server returns.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginRequest, saveSession, roleRedirect } from '@/lib/auth'

export function useSignIn() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function signIn(email: string, password: string, remember: boolean) {
    setLoading(true)
    setError('')
    try {
      const data = await loginRequest(email, password)
      saveSession(data, remember)
      // replace, not push, so Back doesn't return to the login screen.
      router.replace(roleRedirect(data.user.role))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading, error, setError }
}
