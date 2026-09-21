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
      // replace, not push — a pushed entry leaves /login sitting right
      // behind the dashboard in history, so a phone's swipe-back gesture
      // (or the hardware back button) lands you back on the login screen
      // seconds after signing in. Replacing it means back/swipe-back skips
      // straight past login to wherever the browser tab was before that.
      router.replace(roleRedirect(data.user.role))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading, error, setError }
}
