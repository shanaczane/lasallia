// Keeps the kiosk session in sessionStorage (not localStorage), so a refresh
// doesn't end the visit but closing the browser does. The 90-second idle
// timeout still ends sessions.

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

// The saved session, read right away, so app/kiosk/layout.tsx doesn't treat
// a refresh as a new tap and jump back to the catalog.
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
  // Guest browsing: kept on this device only. guestSessionId just links the
  // visit's chat messages together.
  guestBrowsing: boolean
  guestSessionId: string | null
  startGuest: () => void
  endGuest: () => void
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

  // Before paint, so a refresh doesn't flash the idle screen.
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
