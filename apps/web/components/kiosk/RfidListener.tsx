// A hidden input that catches ID card taps (the reader types the card's id
// and presses Enter). Always mounted, so a new tap can end the current session.

'use client'

import { useEffect, useRef } from 'react'

export function RfidListener({ onTap }: { onTap: (uid: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function refocus() {
      // Only take focus when nothing else has it.
      const active = document.activeElement
      if (!active || active === document.body) inputRef.current?.focus({ preventScroll: true })
    }
    refocus()
    document.addEventListener('click', refocus)
    const interval = setInterval(refocus, 1000)
    return () => {
      document.removeEventListener('click', refocus)
      clearInterval(interval)
    }
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const uid = e.currentTarget.value.trim()
    e.currentTarget.value = ''
    if (uid) onTap(uid)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      // aria-label, not aria-hidden: this input usually has focus, and a
      // focused element can't be aria-hidden.
      aria-label="RFID scanner input (background, not for manual use)"
      tabIndex={-1}
      autoComplete="off"
      onKeyDown={handleKeyDown}
      style={{ position: 'fixed', top: -1000, left: -1000, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  )
}
