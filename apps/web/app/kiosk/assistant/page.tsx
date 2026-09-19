// apps/web/app/kiosk/assistant/page.tsx
// Chatbot Phase 7 — the kiosk-surface assistant. Reuses the same
// ChatWindow as the student/guest portals; the only difference is where
// the session id comes from and what happens to its history when the
// visit ends (see components/kiosk/KioskSessionProvider.tsx and
// core/chat_sessions.py). No sidebar here — there's nothing to list,
// kiosk conversations don't outlive the visit. The kiosk shell
// (app/kiosk/layout.tsx) already provides the idle-timeout/RFID-listener/
// Done-Log-out chrome; typing in the chat box already counts as activity
// for free, since useIdleTimeout listens for keydown globally.

'use client'

import ChatWindow from '@/components/chat/shared/ChatWindow'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'

export default function KioskAssistantPage() {
  const { session, guestSessionId } = useKioskSession()

  const sessionId = session ? session.id : guestSessionId
  if (!sessionId) return null

  // The shell already pads the top for the nav bar, so this has to be the
  // viewport minus the nav — a plain h-screen makes the page taller than the
  // window and the whole page scrolls (same sizing as the student/guest
  // assistant pages).
  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - var(--height-nav))' }}>
      <ChatWindow onMenuClick={() => {}} surface="kiosk" sessionId={sessionId} />
    </div>
  )
}
