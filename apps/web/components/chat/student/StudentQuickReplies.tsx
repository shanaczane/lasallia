"use client"

const CHIPS = [
  "Renew my book",
  "Reserve a book",
  "My borrowed books",
  "Library hours",
  "How to borrow?",
  "Search catalog",
]

interface StudentQuickRepliesProps {
  onSelect: (text: string) => void
}

export default function StudentQuickReplies({ onSelect }: StudentQuickRepliesProps) {
  return (
    <div
      className="shrink-0 flex items-center gap-2 px-6 py-3 border-t overflow-x-auto"
      style={{
        borderColor: "var(--color-ink-100)",
        scrollbarWidth: "none",
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
