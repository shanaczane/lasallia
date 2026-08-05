// apps/web/app/kiosk/page.tsx
// The idle screen — tap an ID, or log in manually if you don't have your
// card on hand (build plan 1.4: "a convenience, not a fallback"). Once a
// session opens, the layout's effect routes to /kiosk/catalog.

'use client'

import { useState } from 'react'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'

export default function KioskEntryPage() {
  const { session, opening, openError, open } = useKioskSession()
  const [showManual, setShowManual] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
  if (session) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-8">
      <div className="text-center">
        <h1
          className="text-ink-900 font-semibold"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}
        >
          Welcome to the LRC
        </h1>
        <p className="text-ink-500 mt-2" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
          Tap your school ID to get started
        </p>
      </div>

      {!showManual ? (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="text-green-700 font-medium hover:underline"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Don&apos;t have your ID? Log in manually
        </button>
      ) : (
        <form onSubmit={handleManualSubmit} className="w-full max-w-xs flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@dlsl.edu.ph"
            autoComplete="off"
            required
            className="h-12 px-4 rounded-xl border-2 border-ink-200 outline-none focus-visible:border-green-700 transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="new-password"
            required
            className="h-12 px-4 rounded-xl border-2 border-ink-200 outline-none focus-visible:border-green-700 transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}
          />
          {openError && (
            <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              {openError}
            </p>
          )}
          <button
            type="submit"
            disabled={opening}
            className="h-12 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            {opening ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      )}
    </div>
  )
}
