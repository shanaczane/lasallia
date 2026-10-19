// Live catalog updates. Listens to the public `books` table only; an event
// just says "this book changed", and callers refetch from the API.
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
