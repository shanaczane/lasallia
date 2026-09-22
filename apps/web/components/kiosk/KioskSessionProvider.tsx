// apps/web/components/kiosk/KioskSessionProvider.tsx
// Mirrors the active kiosk session into sessionStorage — NOT localStorage —
// so an accidental page refresh mid-visit (F5, a browser crash-restore,
// whatever) doesn't wipe the whole screen back to blank/idle. sessionStorage
// is the deliberate choice here: it's cleared the moment the browser tab/
// window itself closes, so it never carries a student's identity over to
// the next person once the kiosk terminal actually restarts — the same
// privacy goal the old "memory only" comment was protecting, just without
// losing an in-progress visit to a stray reload. The 90s idle timeout
// (useIdleTimeout, app/kiosk/layout.tsx) is still the real session boundary
// either way — this only survives a refresh, not inactivity.

'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { openSession, endSession, type StationSession } from '@/lib/kiosk'

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const STORAGE_KEY = 'kiosk-active-session'

type StoredSession =
  | { kind: 'session'; session: StationSession }
  | { kind: 'guest'; guestSessionId: string }

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

// For app/kiosk/layout.tsx's "did a session just activate" tracking ref —
// read synchronously (not in an effect) so that ref's initial value already
// matches what KioskSessionProvider's restore is about to settle on. Without
// this, a restored-after-refresh session looks identical to a brand-new tap
// to that tracking logic, and it force-navigates back to /kiosk/catalog on
// every refresh instead of staying on whatever page was open.
export function readInitialActiveKey(): string | null {
  const stored = readStoredSession()
  if (stored?.kind === 'session') return stored.session.id
  if (stored?.kind === 'guest') return stored.guestSessionId
  return null
}

type OpenAuth = Parameters<typeof openSession>[1]

type KioskSessionContextValue = {
  session: StationSession | null
  opening: boolean
  openError: string
  open: (auth: OpenAuth) => Promise<void>
  end: () => Promise<void>
  // Guest browsing — local-only, no station_sessions row (the backend
  // rejects a guest at POST /station-sessions on purpose; this never
  // calls it). guestSessionId exists only to correlate chat turns for
  // the one visit, discarded on endGuest() — never sent anywhere as an
  // identity.
  guestBrowsing: boolean
  guestSessionId: string | null
  startGuest: () => void
  endGuest: () => void
}

const KioskSessionContext = createContext<KioskSessionContextValue | null>(null)

// Single-terminal deployment for now — station_id isn't read anywhere
// downstream except as a label on the station_sessions row.
const STATION_ID = 'kiosk-1'

export function KioskSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StationSession | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  const [guestBrowsing, setGuestBrowsing] = useState(false)
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null)
  // Guards the write-through effect below until the restore effect has had
  // its turn — without this, the write-through would fire once on mount
  // with the default (nothing tapped in yet) state and immediately erase
  // whatever sessionStorage was about to be restored from.
  const [restored, setRestored] = useState(false)

  // Runs before paint (useLayoutEffect, not useEffect) so a refresh never
  // shows a flash of the blank/idle screen before the session comes back.
  useLayoutEffectSafe(() => {
    const stored = readStoredSession()
    if (stored?.kind === 'session') {
      setSession(stored.session)
    } else if (stored?.kind === 'guest') {
      setGuestBrowsing(true)
      setGuestSessionId(stored.guestSessionId)
    }
    setRestored(true)
  }, [])

  useEffect(() => {
    if (!restored) return
    if (session) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'session', session }))
    } else if (guestBrowsing && guestSessionId) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'guest', guestSessionId }))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [restored, session, guestBrowsing, guestSessionId])

  const open = useCallback(async (auth: OpenAuth) => {
    setOpening(true)
    setOpenError('')
    try {
      const previous = session
      const next = await openSession(STATION_ID, auth)
      setSession(next)
      // A real tap/login always wins over whatever was open before —
      // ends a previous student session (build plan: "Tapping a
      // different ID immediately ends the previous session") and, the
      // same way, interrupts guest browsing with nothing to close
      // server-side since it was never backed by a real session.
      if (previous) endSession(previous.id).catch(() => {})
      setGuestBrowsing(false)
      setGuestSessionId(null)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not open a session')
    } finally {
      setOpening(false)
    }
  }, [session])

  const end = useCallback(async () => {
    const current = session
    setSession(null)
    setOpenError('')
    if (current) await endSession(current.id).catch(() => {})
  }, [session])

  const startGuest = useCallback(() => {
    setGuestBrowsing(true)
    setGuestSessionId(crypto.randomUUID())
  }, [])

  const endGuest = useCallback(() => {
    setGuestBrowsing(false)
    setGuestSessionId(null)
  }, [])

  return (
    <KioskSessionContext.Provider
      value={{ session, opening, openError, open, end, guestBrowsing, guestSessionId, startGuest, endGuest }}
    >
      {children}
    </KioskSessionContext.Provider>
  )
}

export function useKioskSession(): KioskSessionContextValue {
  const ctx = useContext(KioskSessionContext)
  if (!ctx) throw new Error('useKioskSession must be used within KioskSessionProvider')
  return ctx
}
