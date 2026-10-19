// True on phones and tablets, which borrow on the device itself (no QR step).
// Touchscreen laptops and the kiosk count as desktops.
export function isHandheld(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  // iPadOS Safari reports itself as a Mac — touch support gives it away.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
}
