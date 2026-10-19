// Renders the bits of markdown the chatbot uses (**bold** and lists)
// instead of showing the raw symbols.

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
