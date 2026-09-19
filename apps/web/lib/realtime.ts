// apps/web/lib/realtime.ts
// Realtime catalog availability. Anonymous client on purpose: the only thing
// subscribed to is the public `books` table (book_copies is RLS-locked and
// carries accession numbers). A change event only says "this book changed" —
// callers refetch through the API, so availability is still computed by the
// backend's _apply_real_availability, never from the event payload.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}

let channelCounter = 0

// Calls onChange (debounced) whenever a book — or just `bookId` — changes.
// Returns an unsubscribe function. A no-op when Supabase env vars are missing.
export function subscribeToBookChanges(onChange: () => void, bookId?: string): () => void {
  const supabase = getClient()
  if (!supabase) return () => {}

  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    clearTimeout(timer)
    timer = setTimeout(onChange, 500)
  }

  const channel = supabase
    .channel(`catalog-availability-${++channelCounter}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'books',
        ...(bookId ? { filter: `id=eq.${bookId}` } : {}),
      },
      fire,
    )
    .subscribe()

  return () => {
    clearTimeout(timer)
    supabase.removeChannel(channel)
  }
}
