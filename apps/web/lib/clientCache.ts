// apps/web/lib/clientCache.ts
// Last-loaded copy of slow dashboard data (the catalog, recommendations), so
// a revisit shows it instantly while a fresh copy loads in the background.
// Memory survives in-app navigation; sessionStorage survives a reload of the
// same tab. Never the source of truth — callers always refetch.

const memory = new Map<string, unknown>()
const PREFIX = "lasallia-cache:"

// Memory only — safe to call during render (a useState initializer): on a
// full page load it's empty on both the server and the client, so it can't
// cause a hydration mismatch.
export function peekMemory<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined
}

export function peekCache<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const value = JSON.parse(raw) as T
    memory.set(key, value)
    return value
  } catch {
    return undefined
  }
}

export function remember<T>(key: string, value: T): void {
  memory.set(key, value)
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — the memory copy still helps */
  }
}

// On sign-out, so the next person on a shared browser never sees the last
// person's recommendations.
export function clearClientCache(): void {
  memory.clear()
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    /* nothing to clear */
  }
}
