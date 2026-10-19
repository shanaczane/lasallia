// A hidden input that catches USB barcode scans (the scanner types the code
// and presses Enter). For screens with no visible input, so scans aren't
// lost. It only takes focus when nothing else has it.

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
