// apps/web/components/kiosk/RfidListener.tsx
// A hidden, always-refocused text input that captures RFID tap input.
// This is the realistic integration point, not a fake stand-in: real
// RFID readers attached to a kiosk act as USB keyboards — they "type" the
// tag UID and send Enter. Mounted for the lifetime of the kiosk shell
// (not just the idle screen) so a NEW tap can interrupt an active session
// (build plan: "Tapping a different ID immediately ends the previous
// session").

'use client'

import { useEffect, useRef } from 'react'

export function RfidListener({ onTap }: { onTap: (uid: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function refocus() {
      // Never steal focus from a real field — e.g. the manual-login
      // email/password inputs. Only refocus when nothing else is
      // deliberately focused.
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
      // Not aria-hidden — this element is real DOM focus itself for most
      // of the kiosk shell's lifetime (see refocus() above), and
      // aria-hidden on a focused element is an invalid, self-contradictory
      // combination (Chrome flags it: "aria-hidden...because its
      // descendant retained focus"). aria-label instead gives assistive
      // tech an honest name for what it lands on, same intent as
      // aria-hidden without the contradiction. tabIndex={-1} still keeps
      // it out of normal Tab order.
      aria-label="RFID scanner input (background, not for manual use)"
      tabIndex={-1}
      autoComplete="off"
      onKeyDown={handleKeyDown}
      style={{ position: 'fixed', top: -1000, left: -1000, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  )
}
