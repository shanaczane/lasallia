// apps/web/components/kiosk/KioskSessionProvider.tsx
// Holds the active kiosk station session in memory only — no localStorage
// or sessionStorage. A page refresh loses the session by design: there's
// no legitimate reason to reload a full-screen public kiosk, and the safe
// default on a shared machine is to lose state, not preserve it.

'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { openSession, endSession, type StationSession } from '@/lib/kiosk'

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
