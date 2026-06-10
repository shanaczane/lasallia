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
    <div className="mt-3 rounded-xl overflow-hidden border border-ink-200 bg-white shadow-sm w-[260px] max-w-full">
      {/* Book cover */}
      <div
        className="h-[80px] relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, var(--color-green-900) 0%, var(--color-green-700) 55%, var(--color-green-300) 100%)",
        }}
      >
        {/* Spine shadow */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-black/20" />
        {/* Crosshatch texture */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)",
            backgroundSize: "8px 8px",
          }}
        />
        {/* Title */}
        <div className="absolute bottom-0 left-3 right-0 p-3 pl-5">
          <p
            className="text-white font-semibold leading-tight line-clamp-2"
            style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-sm-body)", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
          >
            {title}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="px-3 py-2.5 space-y-1.5">
        <p
          className="text-ink-700 font-medium leading-tight"
          style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
        >
          {author}
        </p>
        <p
          className="text-ink-400"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}
        >
          {callNumber}
        </p>
        <div className="flex items-center gap-1 text-ink-400">
          <MapPin size={11} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            {location}
          </span>
        </div>
        <div className="pt-0.5">
          <AvailabilityPill status={availability} />
        </div>
      </div>
    </div>
  )
}
