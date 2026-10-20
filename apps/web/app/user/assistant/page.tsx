"use client"

import { useEffect, useState } from "react"
import ChatSidebar from "@/components/chat/shared/ChatSidebar"
import ChatWindow from "@/components/chat/shared/ChatWindow"
import { WEB_CHAT_SESSION_STORAGE_KEY } from "@/lib/chat"

export default function StudentAssistantPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Which conversation is open — undefined until sessionStorage is read on
  // mount, null for a new chat. Switching just changes this; no reload.
  const [activeSessionId, setActiveSessionId] = useState<string | null>()
  const [sessionsVersion, setSessionsVersion] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage after mount
    setActiveSessionId(sessionStorage.getItem(WEB_CHAT_SESSION_STORAGE_KEY))
  }, [])

  function selectSession(id: string | null) {
    if (id) sessionStorage.setItem(WEB_CHAT_SESSION_STORAGE_KEY, id)
    else sessionStorage.removeItem(WEB_CHAT_SESSION_STORAGE_KEY)
    setActiveSessionId(id)
    setSidebarOpen(false)
  }

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - var(--height-nav))" }}
    >
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSessionId={activeSessionId}
        onSelectSession={selectSession}
        refreshKey={sessionsVersion}
      />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <ChatWindow
        onMenuClick={() => setSidebarOpen((v) => !v)}
        sessionId={activeSessionId}
        onSessionChange={setActiveSessionId}
        onSessionsChanged={() => setSessionsVersion((v) => v + 1)}
      />
    </div>
  )
}
