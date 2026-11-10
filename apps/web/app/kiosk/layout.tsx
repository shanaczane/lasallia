// The kiosk shell: session, ID card listener, idle timeout with a countdown
// warning before it ends, and the same nav as the web. The kiosk opens in
// guest browsing; tapping an ID signs that person in to borrow. Nothing
// personal is shown once a session ends. The timeout and warning come from
// Library Settings.

'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Search, Sparkles, MessageSquare, ChevronLeft, ChevronRight, AlertCircle, IdCard, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TopNav } from '@/components/layout/TopNav'
import { GuestBanner } from '@/components/layout/GuestBanner'
import { RoleBadge } from '@/components/ui/patrons/RoleBadge'
import { KioskSessionProvider, useKioskSession, readInitialActiveKey, activeKey } from '@/components/kiosk/KioskSessionProvider'
import { RfidListener } from '@/components/kiosk/RfidListener'
import { KioskAccountNotices } from '@/components/kiosk/KioskAccountNotices'
import { useIdleTimeout } from '@/components/kiosk/useIdleTimeout'
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'
import { fetchPublicLibrarySettings } from '@/lib/settings'
import { ROLE_LABEL } from '@/lib/roles'

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Used until Library Settings load (and if they can't).
const DEFAULT_IDLE_TIMEOUT_SECONDS = 90
const DEFAULT_WARNING_SECONDS = 20
// How long a tap error stays up.
const OPEN_ERROR_MS = 8000

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const kioskNav = [
  { label: 'Find a book', icon: <Search size={16} />, href: '/kiosk/catalog' },
  // "For you" is only shown to tapped-in students.
  { label: 'For you', icon: <Sparkles size={16} />, href: '/kiosk/for-you', requiresSession: true },
  { label: 'Ask Lasallia', icon: <MessageSquare size={16} />, href: '/kiosk/assistant' },
]

function KioskShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    session, open, end, opening, openError, clearOpenError,
    guestBrowsing, guestSessionId, resetGuest, tapCatcher, borrowing,
  } = useKioskSession()
  // Read right away, so a refresh isn't mistaken for a new tap.
  const previousActiveKey = useRef<string | null>(readInitialActiveKey())
  const [collapsed, setCollapsed] = useState(false)

  const active = !!session || guestBrowsing
  // Sessions saved before the role was sent can only be students.
  const sessionRole = session?.role ?? 'student'

  const [timers, setTimers] = useState({ timeout: DEFAULT_IDLE_TIMEOUT_SECONDS, warning: DEFAULT_WARNING_SECONDS })
  useEffect(() => {
    fetchPublicLibrarySettings()
      .then((s) => {
        if (s.kiosk_idle_timeout_seconds && s.kiosk_idle_warning_seconds) {
          setTimers({ timeout: s.kiosk_idle_timeout_seconds, warning: s.kiosk_idle_warning_seconds })
        }
      })
      .catch(() => { /* keep the defaults */ })
  }, [])

  // A guest visit only times out once someone has used it, so an unattended
  // kiosk sitting on the catalog doesn't keep resetting itself.
  const [usedGuestId, setUsedGuestId] = useState<string | null>(null)
  useEffect(() => {
    if (!guestSessionId) return
    const mark = () => setUsedGuestId(guestSessionId)
    const events = ['mousedown', 'keydown', 'touchstart'] as const
    events.forEach((e) => document.addEventListener(e, mark, { once: true }))
    return () => events.forEach((e) => document.removeEventListener(e, mark))
  }, [guestSessionId])
  const guestUsed = !!guestSessionId && usedGuestId === guestSessionId

  // Paused while a borrow is in progress: the student is at the shelf or
  // on their phone, and still has to come back to tap their ID.
  const idleEnabled = (!!session || (guestBrowsing && guestUsed)) && !borrowing
  const endVisit = () => {
    if (session) end()
    else resetGuest()
  }
  const { secondsLeft, reset } = useIdleTimeout({
    enabled: idleEnabled,
    timeoutSeconds: timers.timeout,
    onExpire: endVisit,
  })
  // "Still here?" is only asked when someone is signed in. An idle guest
  // visit goes straight back to a fresh guest catalog, since there's nothing
  // personal to lose.
  const warningOpen = idleEnabled && !!session && secondsLeft <= timers.warning

  // A tap that didn't open a session says why, then clears.
  useEffect(() => {
    if (!openError) return
    const id = setTimeout(clearOpenError, OPEN_ERROR_MS)
    return () => clearTimeout(id)
  }, [openError, clearOpenError])
  // Focus lands on "Yes, I'm here" so Enter answers it, and Esc counts as
  // still being here too.
  const idleDialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(idleDialogRef, { open: warningOpen, onClose: reset })

  useLayoutEffectSafe(() => {
    if (localStorage.getItem('kiosk-sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('kiosk-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  // Move to the right screen: a new visit (a fresh guest, or a different
  // student tapping in) starts at the catalog.
  //
  // A guest who taps their ID while on a book or the catalog stays there,
  // since it's the same person signing in to borrow.
  useEffect(() => {
    const prev = previousActiveKey.current
    const current = activeKey(session?.id, guestSessionId)
    if (!current) return
    const guestSigningIn = !!prev?.startsWith('guest:') && !!session
    if (current !== prev) {
      if (!(guestSigningIn && pathname.startsWith('/kiosk/catalog'))) router.push('/kiosk/catalog')
    }
    previousActiveKey.current = current
  }, [session, guestSessionId, pathname, router])

  async function handleTap(uid: string) {
    // A borrow waiting for its confirming tap takes it.
    if (tapCatcher.current) {
      tapCatcher.current(uid)
      return
    }
    await open({ authMethod: 'rfid', rfidUid: uid })
  }

  return (
    <div className="min-h-screen w-full bg-paper relative">
      <RfidListener onTap={handleTap} />
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {active && (
        <>
          <TopNav
            // Older saved sessions may not have the full name.
            userName={session ? (session.student_full_name || session.student_first_name) : 'Guest'}
            userInitials={session ? getInitials(session.student_full_name || session.student_first_name) : 'G'}
            userType={session ? (
              <RoleBadge
                role={sessionRole}
                college={session.college}
                program={session.program}
                yearLevel={session.year_level}
              />
            ) : (
              <RoleBadge role="guest" />
            )}
            showNotifications={false}
            // A guest has nothing to sign out of.
            showSignOut={!!session}
            homeHref="/kiosk/catalog"
            onSignOut={() => end()}
            onMenuClick={() => {}}
          />

          <aside
            className="hidden md:flex fixed left-0 bottom-0 flex-col bg-white border-r border-ink-200 overflow-y-auto transition-all duration-200"
            style={{ top: 'var(--height-nav)', width: collapsed ? 56 : 'var(--width-side)' }}
          >
            <div className={cn('shrink-0 flex border-b border-ink-100', collapsed ? 'justify-center p-2' : 'justify-end p-2')}>
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="flex items-center justify-center w-7 h-7 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
              >
                {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            </div>
            <nav className={cn('flex-1 py-4 flex flex-col gap-0.5', collapsed ? 'px-1' : 'px-3')}>
              {kioskNav.filter((item) => !item.requiresSession || !!session).map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center transition-colors rounded-sm',
                      collapsed ? 'justify-center p-2 mx-1' : 'gap-2.5 px-2 py-1.5',
                      isActive ? 'bg-green-100 text-green-800 font-semibold' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900'
                    )}
                  >
                    <span className={cn(isActive ? 'text-green-700' : 'text-ink-400')}>{item.icon}</span>
                    {!collapsed && (
                      <span style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}>{item.label}</span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </aside>

          {warningOpen && (
            <SessionEndingWarning
              dialogRef={idleDialogRef}
              secondsLeft={secondsLeft}
              warningSeconds={timers.warning}
              onStay={reset}
              onEnd={endVisit}
            />
          )}
        </>
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className={cn('min-h-screen transition-all duration-200', active && (collapsed ? 'md:pl-14' : 'md:pl-(--width-side)'))}
        style={active ? { paddingTop: 'var(--height-nav)' } : undefined}
      >
        {session && (
          <p
            role="status"
            className="px-4 md:px-6 py-2 bg-green-50 text-green-800 font-semibold border-b border-green-200"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            Welcome, {session.student_full_name || session.student_first_name} — {ROLE_LABEL[sessionRole]}
          </p>
        )}
        {!session && guestBrowsing && <GuestBanner />}
        {!session && (opening || openError) && (
          <TapStatus opening={opening} error={openError} onDismiss={clearOpenError} />
        )}
        {session && <KioskAccountNotices session={session} />}
        {/* Nothing until the saved visit is restored. */}
        {active && children}
      </main>
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

// An ID tap being read, or why it didn't open a session.
function TapStatus({ opening, error, onDismiss }: { opening: boolean; error: string; onDismiss: () => void }) {
  const message = opening
    ? 'Reading your ID…'
    : error === 'Unknown RFID tag'
      ? "We don't recognize this ID. Please see the librarian at the desk."
      : error
  return (
    <div
      role={opening ? 'status' : 'alert'}
      className={cn(
        'px-4 md:px-6 py-2 flex items-center gap-2 border-b',
        opening ? 'bg-green-50 text-green-800 border-green-200' : 'bg-danger-bg border-red-200'
      )}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm-body)',
        color: opening ? undefined : 'var(--color-danger-dark)',
      }}
    >
      {opening ? <IdCard size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
      <span className="flex-1">{message}</span>
      {!opening && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-white/60 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// The countdown before the session ends: a ring that empties and the
// seconds left, so it's clear at a glance from a few steps away.
function SessionEndingWarning({
  dialogRef,
  secondsLeft,
  warningSeconds,
  onStay,
  onEnd,
}: {
  dialogRef: React.RefObject<HTMLDivElement | null>
  secondsLeft: number
  warningSeconds: number
  onStay: () => void
  onEnd: () => void
}) {
  const RADIUS = 34
  const circumference = 2 * Math.PI * RADIUS
  const fraction = Math.max(0, Math.min(1, secondsLeft / warningSeconds))
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-ending-title"
        aria-describedby="session-ending-text"
        className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full flex flex-col items-center gap-3 text-center"
      >
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="var(--color-ink-100)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r={RADIUS} fill="none"
              stroke="var(--color-warn)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fraction)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-ink-900 font-bold"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)' }}
            aria-hidden="true"
          >
            {secondsLeft}
          </span>
        </div>
        <p id="session-ending-title" className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
          Still here?
        </p>
        <p id="session-ending-text" className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          For your privacy, this session ends in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="w-full py-2.5 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Yes, I&apos;m here
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="w-full py-2.5 rounded-xl border border-ink-200 text-ink-600 font-semibold hover:bg-ink-50 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          End session now
        </button>
      </div>
    </div>
  )
}
