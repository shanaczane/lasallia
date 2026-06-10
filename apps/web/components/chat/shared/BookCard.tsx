"use client"

import { MapPin } from "lucide-react"
import { AvailabilityPill } from "@/components/ui/pills/availability-pill"

export interface BookCardData {
  title: string
  author: string
  callNumber: string
  availability: "available" | "borrowed" | "reserved" | "missing"
  location: string
}

export default function BookCard({ title, author, callNumber, availability, location }: BookCardData) {
  return (
    // mt-3, rounded-lg border ink-100, overflow-hidden, w-[300px]
    <div
      className="mt-3 rounded-lg overflow-hidden w-[300px] max-w-full"
      style={{ border: "1px solid var(--color-ink-100)" }}
    >
      {/* Cover gradient — 120px height */}
      <div
        className="relative overflow-hidden"
        style={{
          height: 120,
          background: "linear-gradient(135deg, var(--color-green-900) 0%, var(--color-green-700) 55%, var(--color-green-300) 100%)",
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-black/20" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg,white 0,white 1px,transparent 0,transparent 50%)",
            backgroundSize: "8px 8px",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 p-3 pl-5">
          <p
            className="text-white font-semibold leading-tight line-clamp-2"
            style={{ fontFamily: "var(--font-display)", fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,.4)" }}
          >
            {title}
          </p>
        </div>
      </div>

      {/* Book info — px-3 py-2.5 */}
      <div className="px-3 py-[10px] space-y-1.5 bg-white">
        <p className="text-ink-700 font-medium leading-tight" style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>
          {author}
        </p>
        <p className="text-ink-400" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {callNumber}
        </p>
        <div className="flex items-center gap-1" style={{ color: "var(--color-ink-400)" }}>
          <MapPin size={11} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12 }}>{location}</span>
        </div>
        <div className="pt-0.5">
          <AvailabilityPill status={availability} />
        </div>
      </div>
    </div>
  )
}
