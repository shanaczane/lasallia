// apps/web/app/kiosk/page.tsx
// The idle screen — tap an ID, or log in manually if you don't have your
// card on hand (build plan 1.4: "a convenience, not a fallback"), or
// continue as a guest. Once a session opens, the layout's effect routes
// to /kiosk/catalog. Styled to match /login (components/login/LoginSection.tsx)
// — same blurred-photo background + centered card treatment — since this
// is the kiosk's equivalent entry screen, just tap-first instead of
// email/password-first.

'use client'

import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, IdCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'

export default function KioskEntryPage() {
  const { session, opening, openError, open, guestBrowsing, startGuest } = useKioskSession()
  const [showManual, setShowManual] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    await open({ authMethod: 'manual_login', email, password })
    // Cleared regardless of outcome — never left sitting in state past
    // submission (kiosk hygiene: "password field clears on... any
    // navigation away").
    setPassword('')
  }

  // Layout's effect is already navigating to /kiosk/catalog — this is
  // just the brief frame before that lands.
  if (session || guestBrowsing) return null

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: 'var(--color-ink-900)' }}>

      {/* Background photo — same asset/treatment as /login */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: `url('/DeLaSalleLip_LRC Banner.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      {/* Centering layer */}
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-5">
        <div
          className="flex w-full max-w-(--max-w-form) flex-col justify-center bg-white rounded-3xl p-6 shadow-(--shadow-lg)"
        >
          {/* Branding header */}
          <div className="mb-4 flex flex-col items-center text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border border-ink-200 bg-white shadow-(--shadow-sm)">
              <img
                src="/DeLaSalleLipa_Seal.png"
                alt="De La Salle Lipa"
                className="h-12 w-12 object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
            <span className="text-ink-900 font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}>
              Lasallia
            </span>
            <span
              className="mt-0.5 text-green-700 font-bold uppercase"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-eyebrow)' }}
            >
              De La Salle Lipa · LRC
            </span>
          </div>

          <div className="mb-4 text-center">
            <h1
              className="text-ink-900 font-bold"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xl)' }}
            >
              Welcome to the LRC
            </h1>
            <p
              className="mt-1 text-ink-400"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              Tap your school ID to get started
            </p>
          </div>

          {!showManual ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                <IdCard size={26} />
              </div>
              <button
                type="button"
                onClick={() => setShowManual(true)}
                className="text-green-700 hover:text-green-900 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 rounded-sm"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                Don&apos;t have your ID? Log in manually
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="kiosk-email"
                  className="mb-1 block font-semibold text-ink-900"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                >
                  DLSL email
                </label>
                <div className="relative">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    id="kiosk-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juandelacruz@dlsl.edu.ph"
                    autoComplete="off"
                    autoFocus
                    required
                    className={cn(
                      'w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-ink-900 placeholder:text-ink-300',
                      'focus:outline-none transition-colors border-ink-200 focus:border-green-700 focus:shadow-(--shadow-focus-green)'
                    )}
                    style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="kiosk-password"
                  className="mb-1 block font-semibold text-ink-900"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                >
                  Password
                </label>
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    id="kiosk-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="new-password"
                    required
                    className={cn(
                      'w-full rounded-xl border bg-white py-2.5 pl-9 pr-10 text-ink-900 placeholder:text-ink-300',
                      'focus:outline-none transition-colors border-ink-200 focus:border-green-700 focus:shadow-(--shadow-focus-green)'
                    )}
                    style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {openError && (
                <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                  {openError}
                </p>
              )}

              <button
                type="submit"
                disabled={opening}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 font-semibold text-white transition-colors hover:bg-green-800 active:bg-green-900 disabled:opacity-60"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                {opening ? 'Signing in…' : 'Continue'}
              </button>
            </form>
          )}

          {/* Guest link — same wording/style as /login's */}
          <div className="mt-3 text-center text-ink-700" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
            Just browsing?{' '}
            <button
              type="button"
              onClick={startGuest}
              className="text-green-700 hover:text-green-900 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 rounded-sm"
            >
              Continue as guest →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
