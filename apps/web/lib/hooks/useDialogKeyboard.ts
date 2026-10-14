// apps/web/lib/hooks/useDialogKeyboard.ts
'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

// Open dialogs, innermost last — only the top one answers Esc and Tab, so
// a confirm dialog opened over a detail panel doesn't close both at once.
const stack: symbol[] = []

function isShown(el: HTMLElement): boolean {
  return el.getClientRects().length > 0
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !el.closest('[inert]') && el.getClientRects().length > 0)
}

// Keyboard behavior every pop-up, dialog and slide-out panel needs:
// - focus moves into it when it opens (unless something inside already
//   took focus, e.g. an autoFocus field),
// - Tab / Shift+Tab cycle inside it instead of wandering to the page behind,
// - Esc closes it (omit onClose for one that can't be dismissed, like the
//   first-login privacy notice),
// - focus returns to whatever opened it once it closes.
export function useDialogKeyboard(
  ref: RefObject<HTMLElement | null>,
  { open = true, onClose }: { open?: boolean; onClose?: () => void } = {},
) {
  // Latest onClose without re-running the effect on every render (callers
  // usually pass an inline arrow).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const id = Symbol('dialog')
    stack.push(id)
    const opener = document.activeElement as HTMLElement | null

    // After paint, so autoFocus inside the dialog has had its chance first.
    const raf = requestAnimationFrame(() => {
      const root = ref.current
      if (!root || !isShown(root) || root.contains(document.activeElement)) return
      const first = focusables(root)[0]
      if (first) first.focus()
      else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
        root.focus()
      }
    })

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return
      const root = ref.current
      // A phone-only drawer that's "open" while the page is at desktop
      // width isn't on screen — leave the keyboard alone.
      if (!root || !isShown(root)) return
      if (e.key === 'Escape' && onCloseRef.current) {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables(root)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      const i = stack.indexOf(id)
      if (i !== -1) stack.splice(i, 1)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [open, ref])
}
