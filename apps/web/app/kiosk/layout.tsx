// apps/web/app/kiosk/layout.tsx
// The shared walk-up terminal shell (build plan Phase 6): full-screen, no
// app chrome. Wraps every /kiosk/* page in the session context, the
// always-on RFID listener (so a new tap can interrupt an active session),
// and the 90s idle timeout with its "Still here?" warning.

'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, Clock, Search, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KioskSessionProvider, useKioskSession } from '@/components/kiosk/KioskSessionProvider'
import { RfidListener } from '@/components/kiosk/RfidListener'
import { useIdleTimeout } from '@/components/kiosk/useIdleTimeout'

const IDLE_TIMEOUT_SECONDS = 90
const WARNING_AT_SECONDS = 15

const NAV_LINKS = [
  { href: '/kiosk/catalog', label: 'Find a book', icon: Search },
  { href: '/kiosk/assistant', label: 'Ask Lasallia', icon: MessageSquare },
]

function KioskShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { session, open, end } = useKioskSession()
  const previousSessionId = useRef<string | null>(null)

  const { secondsLeft, reset } = useIdleTimeout({
    enabled: !!session,
    timeoutSeconds: IDLE_TIMEOUT_SECONDS,
    onExpire: () => { end() },
  })

  // Route the screen to match whatever the session just did: a fresh open
  // (idle -> tapped in) goes to the catalog; an end (timeout or Done/Log
  // out) goes back to idle; a swap (a new tap interrupting an active
  // session) resets to the catalog root rather than leaving the new
  // student on whatever page the previous one was viewing.
  useEffect(() => {
    const prev = previousSessionId.current
    const current = session?.id ?? null
    if (current && current !== prev) {
      router.push('/kiosk/catalog')
    } else if (!current && prev) {
      router.replace('/kiosk')
    }
    previousSessionId.current = current
  }, [session?.id, router])

  async function handleTap(uid: string) {
    await open({ authMethod: 'rfid', rfidUid: uid })
  }

  return (
    <div className="min-h-screen w-full bg-paper relative">
      <RfidListener onTap={handleTap} />

      {session && (
        <>
          <nav className="fixed top-4 left-4 z-50 flex items-center gap-1 p-1 rounded-full bg-white border border-ink-200 shadow-(--shadow-sm)">
            {NAV_LINKS.map((link) => {
              const active = pathname.startsWith(link.href)
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition-colors',
                    active ? 'bg-green-700 text-white' : 'text-ink-600 hover:bg-ink-50'
                  )}
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
                >
                  <Icon size={14} />
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={() => end()}
            className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-ink-200 text-ink-600 font-semibold shadow-(--shadow-sm) hover:bg-ink-50 transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
          >
            <LogOut size={14} />
            Done / Log out
          </button>

          {secondsLeft <= WARNING_AT_SECONDS && (
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center p-4"
              style={{ background: 'rgba(20,21,15,0.55)' }}
            >
              <div className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full flex flex-col items-center gap-3 text-center">
                <Clock size={28} className="text-warn" />
                <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                  Still here?
                </p>
                <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                  This session ends in {secondsLeft}s.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full py-2.5 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                >
                  Yes, I&apos;m here
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {children}
    </div>
  )
}

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <KioskSessionProvider>
      <KioskShell>{children}</KioskShell>
    </KioskSessionProvider>
  )
}
