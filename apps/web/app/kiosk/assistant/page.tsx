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
  const { session } = useKioskSession()

  if (!session) return null

  return (
    <div className="flex h-screen">
      <ChatWindow onMenuClick={() => {}} surface="kiosk" sessionId={session.id} />
    </div>
  )
}
