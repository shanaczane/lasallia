// Shows what the chatbot is doing ("searching the catalog", "writing a
// reply"), so a slow reply doesn't look frozen.

"use client"

export type TypingStatus = "searching" | "writing"

export interface TypingIndicatorProps {
  status: TypingStatus
}

const LABELS: Record<TypingStatus, string> = {
  searching: "Searching the catalog…",
  writing: "Writing a reply…",
}

export default function TypingIndicator({ status }: TypingIndicatorProps) {
  return (
    <div className="flex gap-3">
      <div
        className="shrink-0 flex items-center justify-center rounded-full text-white font-bold self-start mt-0.5"
        style={{
          width: 32, height: 32,
          background: "var(--color-green-700)",
          fontFamily: "var(--font-display)",
          fontSize: 14,
        }}
      >
        L
      </div>
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg rounded-tl-sm shadow-sm"
        style={{
          background: "white",
          border: "1px solid var(--color-ink-100)",
        }}
      >
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="rounded-full animate-bounce"
              style={{
                width: 6, height: 6,
                background: "var(--color-green-700)",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
        <span
          style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-ink-500)" }}
        >
          {LABELS[status]}
        </span>
      </div>
    </div>
  )
}
