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
}

const KioskSessionContext = createContext<KioskSessionContextValue | null>(null)

// Single-terminal deployment for now — station_id isn't read anywhere
// downstream except as a label on the station_sessions row.
const STATION_ID = 'kiosk-1'

export function KioskSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StationSession | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')

  const open = useCallback(async (auth: OpenAuth) => {
    setOpening(true)
    setOpenError('')
    try {
      const previous = session
      const next = await openSession(STATION_ID, auth)
      setSession(next)
      // A new tap/login always wins — end whatever was open first (build
      // plan: "Tapping a different ID immediately ends the previous
      // session"). Fire-and-forget: the new session is already live for
      // this screen regardless of whether the old row finishes closing.
      if (previous) endSession(previous.id).catch(() => {})
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

  return (
    <KioskSessionContext.Provider value={{ session, opening, openError, open, end }}>
      {children}
    </KioskSessionContext.Provider>
  )
}

export function useKioskSession(): KioskSessionContextValue {
  const ctx = useContext(KioskSessionContext)
  if (!ctx) throw new Error('useKioskSession must be used within KioskSessionProvider')
  return ctx
}
