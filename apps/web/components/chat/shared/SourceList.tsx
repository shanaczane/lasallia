"use client"

import Link from "next/link"
import { BookOpen, BookMarked, Clock, Library, UserRound, type LucideIcon } from "lucide-react"
import type { ChatSource } from "@/lib/chat"

export interface SourceData extends ChatSource {
  // A book record's own page in this portal — set by ChatWindow.
  href?: string
}

const KIND: Record<ChatSource["kind"], { icon: LucideIcon; prefix: string }> = {
  handbook: { icon: BookOpen, prefix: "LRC Handbook" },
  book: { icon: BookMarked, prefix: "Book record" },
  catalog: { icon: Library, prefix: "Catalog" },
  hours: { icon: Clock, prefix: "Settings" },
  account: { icon: UserRound, prefix: "Account" },
}

export default function SourceList({ sources }: { sources: SourceData[] }) {
  return (
    <div className="mt-3 pt-2.5" style={{ borderTop: "1px solid var(--color-ink-100)" }}>
      <p
        className="uppercase tracking-wide font-semibold mb-1.5"
        style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--color-ink-400)" }}
      >
        {sources.length === 1 ? "Source" : "Sources"}
      </p>
      <ul className="flex flex-col gap-1">
        {sources.map((s, i) => {
          const { icon: Icon, prefix } = KIND[s.kind]
          const body = (
            <>
              <Icon size={13} className="shrink-0 mt-0.5" style={{ color: "var(--color-green-700)" }} />
              <span className="min-w-0">
                <span style={{ color: "var(--color-ink-400)" }}>{prefix} · </span>
                <span className="font-semibold" style={{ color: "var(--color-ink-700)" }}>{s.label}</span>
                {s.detail && <span style={{ color: "var(--color-ink-400)" }}> · {s.detail}</span>}
              </span>
            </>
          )
          return (
            <li key={i} style={{ fontFamily: "var(--font-body)", fontSize: 12, lineHeight: "1.45", whiteSpace: "normal" }}>
              {s.href ? (
                <Link href={s.href} className="flex items-start gap-1.5 rounded hover:underline">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-1.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
