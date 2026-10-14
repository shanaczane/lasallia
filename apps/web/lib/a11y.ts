// apps/web/lib/a11y.ts
import type { KeyboardEvent } from 'react'

// Makes a clickable element that isn't a <button> (a table row, a list
// card) reachable with Tab and pressable with Enter or Space, the same as
// a mouse click. Keys pressed on a real button or link inside it are left
// to that control.
export function pressable(action: () => void) {
  return {
    tabIndex: 0,
    onClick: action,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        action()
      }
    },
  }
}
