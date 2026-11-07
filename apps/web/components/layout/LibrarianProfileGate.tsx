// Nothing in the librarian area renders until a librarian has picked their
// profile, so no page, poll or notification reaches the API while the picker
// is showing. After the idle time, it goes back to the picker.

"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react"
import {
  clearActiveProfile,
  getActiveProfile,
  installProfileFetch,
  renewActiveProfile,
  saveActiveProfile,
  subscribeActiveProfile,
  type ActiveProfile,
} from "@/lib/librarianProfile"
import { useRequireSession } from "@/lib/hooks/useRequireSession"
import { LibrarianProfilePicker } from "./LibrarianProfilePicker"

const CHECK_EVERY_MS = 15_000
// The token is renewed at most this often, and only after some activity.
const RENEW_EVERY_MS = 2 * 60_000
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const

const ActiveProfileContext = createContext<ActiveProfile | null>(null)

// The librarian using Lasallia. Only for use inside the librarian area.
export function useActiveLibrarian(): ActiveProfile | null {
  return useContext(ActiveProfileContext)
}

function useIdleLock(profile: ActiveProfile | null | undefined) {
  const profileId = profile?.profile_id
  const idleMinutes = profile?.idle_timeout_minutes
  const lastActivity = useRef(0)
  const lastRenewal = useRef(0)

  useEffect(() => {
    if (!profileId || !idleMinutes) return
    const idleMs = idleMinutes * 60_000
    const startedAt = Date.now()
    lastActivity.current = startedAt
    lastRenewal.current = startedAt

    function onActivity() {
      lastActivity.current = Date.now()
    }

    async function check() {
      const now = Date.now()
      const active = getActiveProfile()
      if (!active) return
      if (now - lastActivity.current >= idleMs || new Date(active.expires_at).getTime() <= now) {
        clearActiveProfile()
        return
      }
      if (lastActivity.current > lastRenewal.current && now - lastRenewal.current >= RENEW_EVERY_MS) {
        lastRenewal.current = now
        try {
          saveActiveProfile(await renewActiveProfile())
        } catch {
          // A dropped connection: the next check tries again. A refused
          // token has already brought the picker back.
        }
      }
    }

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true })
    document.addEventListener("visibilitychange", check)
    const interval = setInterval(check, CHECK_EVERY_MS)
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
      document.removeEventListener("visibilitychange", check)
      clearInterval(interval)
    }
  }, [profileId, idleMinutes])
}

export function LibrarianProfileGate({ children }: { children: React.ReactNode }) {
  // undefined on the server and the first paint, before the tab's token is read.
  const profile = useSyncExternalStore(subscribeActiveProfile, getActiveProfile, () => undefined)

  useRequireSession()
  // A layout effect, so it's in place before any page's first request.
  useLayoutEffect(() => installProfileFetch(), [])
  useIdleLock(profile)

  if (profile === undefined) return null
  if (profile === null) return <LibrarianProfilePicker />
  return <ActiveProfileContext.Provider value={profile}>{children}</ActiveProfileContext.Provider>
}
