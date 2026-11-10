// Keeps the kiosk session in sessionStorage (not localStorage), so a refresh
// doesn't end the visit but closing the browser does. The idle timeout (set
// in Library Settings) still ends sessions.
//
// There's no start screen: with no ID tapped, the kiosk is in guest
// browsing. Ending a session (or a guest visit) starts a fresh guest visit.

'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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

// Names the current visit, so app/kiosk/layout.tsx can tell a new tap or a
// fresh guest visit from a refresh.
export function activeKey(sessionId: string | null | undefined, guestSessionId: string | null): string | null {
  if (sessionId) return `session:${sessionId}`
  if (guestSessionId) return `guest:${guestSessionId}`
  return null
}

// The saved visit, read right away, so a refresh isn't treated as a new tap.
export function readInitialActiveKey(): string | null {
  const stored = readStoredSession()
  if (stored?.kind === 'session') return activeKey(stored.session.id, null)
  if (stored?.kind === 'guest') return activeKey(null, stored.guestSessionId)
  return null
}

type OpenAuth = Parameters<typeof openSession>[1]

type KioskSessionContextValue = {
  session: StationSession | null
  opening: boolean
  openError: string
  open: (auth: OpenAuth) => Promise<void>
  end: () => Promise<void>
  // Guest browsing: kept on this device only. guestSessionId just links the
  // visit's chat messages together. resetGuest starts a fresh guest visit.
  guestBrowsing: boolean
  guestSessionId: string | null
  resetGuest: () => void
  // Clears the message from a tap that didn't open a session.
  clearOpenError: () => void
  // While a borrow waits for its second ID tap, the borrow window takes
  // the next tap instead of it starting a new session. Returns a function
  // that stops catching taps.
  catchNextTaps: (handler: (uid: string) => void) => () => void
  tapCatcher: React.RefObject<((uid: string) => void) | null>
  // A borrow is in progress (QR code up), so the idle timer waits.
  borrowing: boolean
  setBorrowing: (value: boolean) => void
}

const KioskSessionContext = createContext<KioskSessionContextValue | null>(null)

// Only one kiosk for now; this is just a label.
const STATION_ID = 'kiosk-1'

export function KioskSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StationSession | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  const [guestBrowsing, setGuestBrowsing] = useState(false)
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null)
  // Don't save until the saved session has been restored, or it'd be erased.
  const [restored, setRestored] = useState(false)
  const tapCatcher = useRef<((uid: string) => void) | null>(null)
  const [borrowing, setBorrowing] = useState(false)

  const catchNextTaps = useCallback((handler: (uid: string) => void) => {
    tapCatcher.current = handler
    return () => {
      if (tapCatcher.current === handler) tapCatcher.current = null
    }
  }, [])

  // Before paint, so a refresh keeps the same visit. With nothing saved, a
  // guest visit starts.
  useLayoutEffectSafe(() => {
    const stored = readStoredSession()
    if (stored?.kind === 'session') {
      setSession(stored.session)
    } else {
      setGuestBrowsing(true)
      setGuestSessionId(stored?.kind === 'guest' ? stored.guestSessionId : crypto.randomUUID())
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
      // A new tap ends the previous session (or guest browsing).
      if (previous) endSession(previous.id).catch(() => {})
      setGuestBrowsing(false)
      setGuestSessionId(null)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not open a session')
    } finally {
      setOpening(false)
    }
  }, [session])

  const resetGuest = useCallback(() => {
    setGuestBrowsing(true)
    setGuestSessionId(crypto.randomUUID())
  }, [])

  // Back to a fresh guest visit.
  const end = useCallback(async () => {
    const current = session
    setSession(null)
    setBorrowing(false)
    tapCatcher.current = null
    setOpenError('')
    resetGuest()
    if (current) await endSession(current.id).catch(() => {})
  }, [session, resetGuest])

  const clearOpenError = useCallback(() => setOpenError(''), [])

  return (
    <KioskSessionContext.Provider
      value={{
        session, opening, openError, open, end, guestBrowsing, guestSessionId, resetGuest, clearOpenError,
        catchNextTaps, tapCatcher, borrowing, setBorrowing,
      }}
    >
      {children}
    </KioskSessionContext.Provider>
  )
}

// For components also used outside the kiosk (the borrow window on the web).
export function useOptionalKioskSession(): KioskSessionContextValue | null {
  return useContext(KioskSessionContext)
}

export function useKioskSession(): KioskSessionContextValue {
  const ctx = useContext(KioskSessionContext)
  if (!ctx) throw new Error('useKioskSession must be used within KioskSessionProvider')
  return ctx
}
