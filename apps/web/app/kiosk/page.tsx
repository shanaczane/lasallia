// The kiosk start screen: tap an ID, or continue as a guest. There's no
// email and password form, since the kiosk is a shared screen; borrowers
// are identified by their ID only. Styled like /login.

'use client'

import { IdCard } from 'lucide-react'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'

export default function KioskEntryPage() {
  const { session, opening, openError, guestBrowsing, startGuest } = useKioskSession()

  // The layout is already moving to /kiosk/catalog.
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

          <div className="flex flex-col items-center gap-3 py-2 text-center" aria-live="polite">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <IdCard size={26} />
            </div>
            {opening ? (
              <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                Reading your ID…
              </p>
            ) : openError ? (
              <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                {openError === 'Unknown RFID tag' ? "We don't recognize this ID. Please see the librarian at the desk." : openError}
              </p>
            ) : (
              <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                No ID with you? Please see the librarian at the desk.
              </p>
            )}
          </div>

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
