"use client"

import { useState } from "react"
import ChatSidebar from "@/components/chat/shared/ChatSidebar"
import ChatWindow from "@/components/chat/shared/ChatWindow"
import GuestQuickReplies from "@/components/chat/guest/GuestQuickReplies"

export default function GuestAssistantPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - var(--height-nav))" }}
    >
      <ChatSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <ChatWindow
        onMenuClick={() => setSidebarOpen((v) => !v)}
        quickRepliesSlot={(onSelect) => <GuestQuickReplies onSelect={onSelect} />}
      />
    </div>
  )
}
