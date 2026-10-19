// The kiosk chatbot. Same chat window as the web, using the kiosk session's
// id; the chat is deleted when the visit ends, so there's no chat list.

'use client'

import ChatWindow from '@/components/chat/shared/ChatWindow'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'

export default function KioskAssistantPage() {
  const { session, guestSessionId } = useKioskSession()

  const sessionId = session ? session.id : guestSessionId
  if (!sessionId) return null

  // Full height minus the nav, so the page itself doesn't scroll.
  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - var(--height-nav))' }}>
      <ChatWindow onMenuClick={() => {}} surface="kiosk" sessionId={sessionId} />
    </div>
  )
}
