// The kiosk shell: session, ID card listener, 90-second idle timeout with a
// "Still here?" warning, and the same nav as the web. Nothing personal is
// shown once a session ends.

'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Clock, Search, Sparkles, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TopNav } from '@/components/layout/TopNav'
import { KioskSessionProvider, useKioskSession, readInitialActiveKey } from '@/components/kiosk/KioskSessionProvider'
import { RfidListener } from '@/components/kiosk/RfidListener'
import { useIdleTimeout } from '@/components/kiosk/useIdleTimeout'
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const IDLE_TIMEOUT_SECONDS = 90
const WARNING_AT_SECONDS = 15

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
  const { session, open, end, guestBrowsing, endGuest } = useKioskSession()
  // Read right away, so a refresh isn't mistaken for a new tap.
  const previousActiveKey = useRef<string | null>(readInitialActiveKey())
  const [collapsed, setCollapsed] = useState(false)

  const active = !!session || guestBrowsing

  const { secondsLeft, reset } = useIdleTimeout({
    enabled: active,
    timeoutSeconds: IDLE_TIMEOUT_SECONDS,
    onExpire: () => { session ? end() : endGuest() },
  })
  // "Still here?" — focus lands on "Yes, I'm here" so Enter answers it, and
  // Esc counts as still being here too.
  const idleDialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(idleDialogRef, { open: secondsLeft <= WARNING_AT_SECONDS, onClose: reset })

  useLayoutEffectSafe(() => {
    if (localStorage.getItem('kiosk-sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('kiosk-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  // Move to the right screen: a new session goes to the catalog; no session
  // goes back to the start screen (from any page); a different student
  // tapping in starts again at the catalog.
  //
  // A guest who taps their ID while on a book or the catalog stays there,
  // since it's the same person signing in to borrow.
  useEffect(() => {
    const prev = previousActiveKey.current
    const current = session?.id ?? (guestBrowsing ? 'guest' : null)
    const guestSigningIn = prev === 'guest' && !!session
    if (current && current !== prev) {
      if (!(guestSigningIn && pathname.startsWith('/kiosk/catalog'))) router.push('/kiosk/catalog')
    } else if (!current && pathname !== '/kiosk') {
      router.replace('/kiosk')
    }
    previousActiveKey.current = current
  }, [session?.id, guestBrowsing, pathname, router])

  async function handleTap(uid: string) {
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
            showNotifications={false}
            showSignOut={true}
            homeHref="/kiosk/catalog"
            onSignOut={() => (session ? end() : endGuest())}
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

          {secondsLeft <= WARNING_AT_SECONDS && (
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center p-4"
              style={{ background: 'rgba(20,21,15,0.55)' }}
            >
              <div ref={idleDialogRef} role="alertdialog" aria-modal="true" aria-label="Still here?" className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full flex flex-col items-center gap-3 text-center">
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

      <main
        id="main-content"
        tabIndex={-1}
        className={cn('min-h-screen transition-all duration-200', active && (collapsed ? 'md:pl-14' : 'md:pl-(--width-side)'))}
        style={active ? { paddingTop: 'var(--height-nav)' } : undefined}
      >
        {/* Without a session, show nothing until the redirect to /kiosk. */}
        {(active || pathname === '/kiosk') && children}
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
