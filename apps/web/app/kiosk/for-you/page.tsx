// apps/web/app/kiosk/for-you/page.tsx
// The kiosk's "For you" tab. Same section the student dashboard shows, but
// fed by the tapped-in station session (no JWT at a kiosk) and linking into
// the kiosk catalog. A guest visit has no identity to personalize on, so it
// gets the public "Popular at the LRC" list the section already words honestly.

'use client'

import { ForYouSection } from '@/components/ui/dashboard/ForYouSection'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'
import { fetchKioskRecommendations } from '@/lib/recommendations'

export default function KioskForYouPage() {
  const { session, guestBrowsing } = useKioskSession()
  if (!session && !guestBrowsing) return null

  return (
    <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto">
      <ForYouSection
        // Keyed so a different student tapping in gets a fresh fetch, never
        // the previous student's list left on screen.
        key={session?.id ?? 'guest'}
        fetcher={() => fetchKioskRecommendations(session?.id ?? null)}
        hrefPrefix="/kiosk/catalog"
      />
    </div>
  )
}
