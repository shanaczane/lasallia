// Reads barcodes from the webcam (the alternative to a USB scanner). Uses
// ZXing because Chrome on Windows has no built-in barcode reader.

'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

// Barcode types on the stickers (plus QR). Fewer types decode faster.
const FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODABAR,
  BarcodeFormat.EAN_13,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
]

// Ignore the same code for this long, since the camera keeps seeing it.
const REPEAT_COOLDOWN_MS = 2500

export function CameraScanner({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState('')

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]])
    const reader = new BrowserMultiFormatReader(hints)
    let controls: IScannerControls | null = null
    let cancelled = false
    let last = { code: '', at: 0 }

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (!result) return
        const code = result.getText().trim()
        const now = Date.now()
        if (!code || (code === last.code && now - last.at < REPEAT_COOLDOWN_MS)) return
        last = { code, at: now }
        onScanRef.current(code)
      })
      .then((c) => {
        if (cancelled) c.stop()
        else controls = c
      })
      .catch(() => {
        if (!cancelled) setError('Could not open the camera. Allow camera access in the browser, or use a USB scanner.')
      })

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-(--radius) bg-ink-900 aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        {/* Aiming guide — a sticker inside the box decodes fastest. */}
        <div className="absolute inset-x-[15%] top-1/2 -translate-y-1/2 h-1/3 border-2 border-white/80 rounded-sm pointer-events-none" />
      </div>
      {error && (
        <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>{error}</p>
      )}
    </div>
  )
}
