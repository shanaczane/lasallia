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

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()

  // Guests have no identity to personalize on, and the nav tab is hidden
  // for them (see app/kiosk/layout.tsx) — this only catches a stray/
  // bookmarked URL, same guard style as the layout's own route effect.
  useEffect(() => {
    if (guestBrowsing && !session) router.replace('/kiosk/catalog')
  }, [guestBrowsing, session, router])

  if (!session) return null

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
        {greeting()}, <span className="italic text-green-700">{session.student_full_name || session.student_first_name}</span>.
      </h1>

      {/* For You — recommendations plan Phase 6, same section the student
          dashboard shows. */}
      <ForYouSection
        // Keyed so a different student tapping in gets a fresh fetch, never
        // the previous student's list left on screen. Prefixed — CatalogHighlights
        // below is keyed off the same session id, and React only requires
        // uniqueness among siblings, not that every key in the tree is distinct.
        key={`for-you-${session.id}`}
        fetcher={() => fetchKioskRecommendations(session.id)}
        hrefPrefix="/kiosk/catalog"
      />

      {/* New Arrivals only — sprint 5.7 added Program/College sections too,
          but the kiosk's For You tab sticks to New Arrivals here. identity
          is still passed (rather than omitted) so the component never falls
          back to getUser()/localStorage for it: this is a shared terminal,
          and that fallback would risk showing a different student's
          program/college than the one actually standing here, even though
          those sections are hidden. */}
      <CatalogHighlights
        key={`highlights-${session.id}`}
        identity={{ program: session.program ?? null, college: session.college ?? null }}
        showProgramCollege={false}
        hrefPrefix="/kiosk/catalog"
      />
    </div>
  )
}
