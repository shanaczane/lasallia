"use client"

import { useRef, useState } from "react"
import { Send } from "lucide-react"

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  hintText?: string
}

export default function ChatInput({ onSend, disabled, hintText }: ChatInputProps) {
  const [value, setValue] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue("")
    if (ref.current) {
      ref.current.style.height = "auto"
      ref.current.focus()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    // px-6 py-4, border-top ink-100
    <div
      className="shrink-0 px-6 py-4 bg-white border-t"
      style={{ borderColor: "var(--color-ink-100)" }}
    >
      <div className="flex items-end gap-3">
        {/* Input — full width, rounded-xl, border ink-200, px-4 py-3, 14px */}
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Lasallia anything…"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none rounded-xl px-4 py-3 text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-2 transition-all"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: "1.5",
            maxHeight: 120,
            border: "1px solid var(--color-ink-200)",
            background: "var(--color-ink-50)",
          } as React.CSSProperties}
        />
        {/* Send — green-700, rounded-full, 40px */}
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled}
          aria-label="Send"
          className="shrink-0 flex items-center justify-center rounded-full text-white transition-all hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
          style={{ width: 40, height: 40, background: "var(--color-green-700)" }}
        >
          <Send size={16} />
        </button>
      </div>

      {/* Hint text — ink-400 11px center */}
      <p
        className="text-center mt-2"
        style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--color-ink-400)" }}
      >
        {hintText ?? "Shift + Enter for new line"}
      </p>
    </div>
  )
}
