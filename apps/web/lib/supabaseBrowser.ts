// Supabase client used only for Google sign-in. Its session is handed to
// lib/auth.ts and then dropped. Auto-refresh is off because the API refreshes
// tokens, and two refreshers would break each other.
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
