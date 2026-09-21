// apps/web/lib/supabaseBrowser.ts
// Google sign-in only. Supabase handles the OAuth round trip; the resulting
// session is handed straight to lib/auth.ts's saveSession and this client's
// own copy is dropped (see app/auth/callback/page.tsx), so the app keeps a
// single source of truth for tokens. autoRefreshToken is off for the same
// reason — the API's /auth/refresh owns rotation, and two refreshers would
// invalidate each other's refresh token.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabaseAuth(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Google sign-in is not configured')
  if (!client) {
    client = createClient(url, key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: true },
    })
  }
  return client
}
