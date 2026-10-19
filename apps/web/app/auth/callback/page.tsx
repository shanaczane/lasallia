// Where Google sign-in returns. Saves the session and redirects by role.
"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { adoptSupabaseSession, roleRedirect } from "@/lib/auth"
import { getSupabaseAuth } from "@/lib/supabaseBrowser"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  // React dev mode runs effects twice; the sign-in code only works once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function finish() {
      try {
        const supabase = getSupabaseAuth()
        const { data, error: sessionError } = await supabase.auth.getSession()
        const session = data.session
        if (sessionError || !session) throw new Error(sessionError?.message ?? "Google sign-in didn't complete")

        const user = await adoptSupabaseSession(session)
        router.replace(roleRedirect(user.role))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Google sign-in failed")
      }
    }
    finish()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      {error ? (
        <div className="text-center">
          <p role="alert" className="text-danger" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
            {error}
          </p>
          <a
            href="/login"
            className="mt-3 inline-block text-green-700 font-semibold hover:text-green-900"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Back to sign in
          </a>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-ink-700" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
          Signing you in…
        </p>
      )}
    </main>
  )
}
