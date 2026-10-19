// Keeps the last-loaded dashboard data (catalog, recommendations) so a
// revisit shows it at once while fresh data loads. Callers always refetch.

const memory = new Map<string, unknown>()
const PREFIX = "lasallia-cache:"

// Memory only, so it's safe during render (no hydration mismatch).
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

// Called on sign-out, so the next person doesn't see the last one's data.
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
