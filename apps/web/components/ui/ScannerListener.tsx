// apps/web/components/ui/ScannerListener.tsx
// A hidden, always-refocused text input that captures 2D barcode scanner
// input. Same integration point as components/kiosk/RfidListener.tsx: a
// USB "plug and play" barcode scanner is a HID keyboard-wedge device — it
// "types" the decoded value into whatever has focus and sends Enter,
// indistinguishable from someone typing fast. Visible accession-number
// inputs already work with a scanner for free; this exists for the
// screens where no such input is on-screen (a confirmation/result card,
// or after a click moved focus to a button) so a scan is never silently
// lost. Only refocuses when nothing else is deliberately focused, so it
// never steals input from a field the librarian is actually typing into.

'use client'

import { useEffect, useRef } from 'react'

export function ScannerListener({ onScan }: { onScan: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function refocus() {
      const active = document.activeElement
      if (!active || active === document.body) inputRef.current?.focus()
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
    const value = e.currentTarget.value.trim()
    e.currentTarget.value = ''
    if (value) onScan(value)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      aria-hidden="true"
      tabIndex={-1}
      autoComplete="off"
      onKeyDown={handleKeyDown}
      style={{ position: 'fixed', top: -1000, left: -1000, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  )
}
