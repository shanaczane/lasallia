"use client"

const CHIPS = [
  "Where is this book?",
  "Is this available?",
  "Library hours",
  "How to borrow?",
  "Contact librarian",
  "Search catalog",
]

interface GuestQuickRepliesProps {
  onSelect: (text: string) => void
}

export default function GuestQuickReplies({ onSelect }: GuestQuickRepliesProps) {
  return (
    // px-6 py-3, border-top ink-100, horizontal scroll no scrollbar
    <div
      className="shrink-0 flex items-center gap-2 px-6 py-3 border-t overflow-x-auto"
      style={{
        borderColor: "var(--color-ink-100)",
        scrollbarWidth: "none",
        // Safari / Chrome
        WebkitOverflowScrolling: "touch",
      }}
    >
      {CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="shrink-0 rounded-full border transition-colors hover:bg-green-50"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--color-ink-700)",
            borderColor: "var(--color-ink-200)",
            paddingInline: "12px",
            paddingBlock: "6px",
            lineHeight: 1.4,
            whiteSpace: "nowrap",
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}
