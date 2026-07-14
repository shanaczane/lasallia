// apps/web/lib/hooks/useSignIn.ts
// Compact login redesign — role now comes only from the server response
// (never a client-selected value); this hook owns the request + redirect.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginRequest, saveSession, roleRedirect } from '@/lib/auth'

export function useSignIn() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function signIn(email: string, password: string) {
    setLoading(true)
    setError('')
    try {
      const data = await loginRequest(email, password)
      saveSession(data)
      router.push(roleRedirect(data.user.role))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading, error, setError }
}
