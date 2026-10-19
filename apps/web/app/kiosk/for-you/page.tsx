// The kiosk's "For you" tab: like the student dashboard, without the stat
// cards, for the student who tapped in.

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

  // Guests don't get this tab; send them away if they reach the URL.
  useEffect(() => {
    if (guestBrowsing && !session) router.replace('/kiosk/catalog')
  }, [guestBrowsing, session, router])

  if (!session) return null

  return (
    <div className="px-5 sm:px-8 py-7 flex flex-col gap-6">

      {/* Greeting (no "Find a book" button; the sidebar already has one). */}
      <h1
        className="text-ink-900 font-semibold leading-tight"
        style={{ fontSize: 'var(--text-4xl)', fontFamily: 'var(--font-display)' }}
      >
        {greeting()}, <span className="italic text-green-700">{session.student_full_name || session.student_first_name}</span>.
      </h1>

      {/* For You */}
      <ForYouSection
        // Keyed by session, so a new student never sees the last one's list.
        key={`for-you-${session.id}`}
        fetcher={() => fetchKioskRecommendations(session.id)}
        hrefPrefix="/kiosk/catalog"
        // Shared terminal: never show a cached list from another student.
        cacheKey={null}
      />

      {/* New Arrivals and the student's program, from the kiosk session (never
          browser storage, which could hold another student). */}
      <CatalogHighlights
        key={`highlights-${session.id}`}
        identity={{ program: session.program ?? null, college: session.college ?? null }}
        showCollege={false}
        hrefPrefix="/kiosk/catalog"
      />
    </div>
  )
}
