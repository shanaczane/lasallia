// apps/web/components/chat/shared/formatChatText.tsx
// The model writes markdown-ish text (**bold**, "- " / "1. " lists) even
// though ChatMessage renders bot replies as plain text — without this,
// the raw "**" and list markers show up literally in the bubble instead
// of the emphasis/structure they're meant to convey. A full markdown
// library is overkill for the handful of patterns the system prompt's
// "keep prose short" style actually produces, so this only handles those.

import type { ReactNode } from "react"

function renderInline(text: string, keyPrefix: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${i}`}>{part}</span>
  )
}

const BULLET_RE = /^[-*]\s+(.*)/
const NUMBERED_RE = /^(\d+)\.\s+(.*)/

export function renderChatText(content: string): ReactNode {
  return content.split("\n").map((line, i) => {
    const bullet = line.match(BULLET_RE)
    if (bullet) {
      return (
        <div key={i} className="flex gap-2">
          <span aria-hidden>•</span>
          <span>{renderInline(bullet[1], `li-${i}`)}</span>
        </div>
      )
    }

    const numbered = line.match(NUMBERED_RE)
    if (numbered) {
      return (
        <div key={i} className="flex gap-2">
          <span>{numbered[1]}.</span>
          <span>{renderInline(numbered[2], `ol-${i}`)}</span>
        </div>
      )
    }

    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />

    return <div key={i}>{renderInline(line, `l-${i}`)}</div>
  })
}
