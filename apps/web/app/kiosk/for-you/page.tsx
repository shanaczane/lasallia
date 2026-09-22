// apps/web/app/kiosk/for-you/page.tsx
// The kiosk's "For you" tab — mirrors the student dashboard's content
// (app/student/dashboard/page.tsx) minus the stat cards, which need loan/
// reservation data the kiosk doesn't fetch here. Fed by the tapped-in
// station session (no JWT at a kiosk) instead of localStorage/GET /auth/me,
// and links into the kiosk catalog. A guest visit has no identity to
// personalize on, so both sections fall back to their honest public
// versions ("Popular at the LRC" / New Arrivals only — see ForYouSection
// and CatalogHighlights).

'use client'

import { ForYouSection } from '@/components/ui/dashboard/ForYouSection'
import { CatalogHighlights } from '@/components/ui/dashboard/CatalogHighlights'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'
import { fetchKioskRecommendations } from '@/lib/recommendations'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function KioskForYouPage() {
  const { session, guestBrowsing } = useKioskSession()
  if (!session && !guestBrowsing) return null

  return (
    <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto flex flex-col gap-6">

      {/* Greeting — same tone as the student dashboard's, without the
          "Find a book" CTA next to it: the kiosk sidebar already has a
          permanent "Find a book" nav item, so a second one here would just
          compete with it for attention. */}
      <h1
        className="text-ink-900 font-semibold leading-tight"
        style={{ fontSize: 'var(--text-4xl)', fontFamily: 'var(--font-display)' }}
      >
        {session ? (
          <>{greeting()}, <span className="italic text-green-700">{session.student_first_name}</span>.</>
        ) : (
          <>Welcome to the <span className="italic text-green-700">LRC</span>.</>
        )}
      </h1>

      {/* For You — recommendations plan Phase 6, same section the student
          dashboard shows. */}
      <ForYouSection
        // Keyed so a different student tapping in gets a fresh fetch, never
        // the previous student's list left on screen.
        key={session?.id ?? 'guest'}
        fetcher={() => fetchKioskRecommendations(session?.id ?? null)}
        hrefPrefix="/kiosk/catalog"
      />

      {/* New Arrivals / Program / College — sprint 5.7. identity comes from
          the station session (program/college now ride along on it — see
          schemas/session.py), never getUser()/localStorage: this is a
          shared terminal, and falling back to whatever's cached in this
          browser's localStorage would risk showing a different student's
          program/college than the one actually standing here. */}
      <CatalogHighlights
        key={session?.id ?? 'guest'}
        identity={{ program: session?.program ?? null, college: session?.college ?? null }}
        hrefPrefix="/kiosk/catalog"
      />
    </div>
  )
}
