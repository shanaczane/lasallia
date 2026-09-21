// apps/web/app/auth/callback/page.tsx
// Landing page after Google sign-in. Supabase has already exchanged the OAuth
// code for a session (detectSessionInUrl); this hands it to the app's own
// session store and routes by the role in profiles.
"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { fetchMe, roleRedirect, saveSession } from "@/lib/auth"
import { getSupabaseAuth } from "@/lib/supabaseBrowser"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  // Strict-mode double effect would try to use the one-time code twice.
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

        const user = await fetchMe(session.access_token)
        saveSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          user,
        })
        // Drop supabase-js's own copy so only lib/auth.ts owns the tokens.
        await supabase.auth.signOut({ scope: "local" })
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
