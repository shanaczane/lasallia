// apps/web/components/chat/shared/TypingIndicator.tsx
// Chatbot Phase 2.4 — a status-aware typing indicator ("searching the
// catalog" vs "writing a reply"), not a generic dot animation, since a
// tool call adds latency the student can otherwise misread as a freeze.
// Not implemented yet.

"use client"

export type TypingStatus = "searching" | "writing"

export interface TypingIndicatorProps {
  status: TypingStatus
}

export default function TypingIndicator({ status }: TypingIndicatorProps): React.ReactElement {
  throw new Error("Not implemented — Phase 2")
}
