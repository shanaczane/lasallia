// apps/web/lib/device.ts
// Phones and tablets borrow on the device in hand — there's no second
// screen for a QR to be scanned from. A touchscreen laptop or the kiosk PC
// still counts as a desktop: it has a fine pointer alongside the touch one.
export function isHandheld(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  // iPadOS Safari reports itself as a Mac — touch support gives it away.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
}
