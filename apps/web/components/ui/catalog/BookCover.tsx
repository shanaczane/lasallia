// A cover image that shows the placeholder instead when there's no real
// picture: a broken link, or Destiny's 1×1 "no cover" image.
'use client'

import { useEffect, useRef, useState } from 'react'

// Links known to have no picture, shared by every cover on the page.
const noPicture = new Set<string>()

// Anything this small is a spacer/placeholder pixel, not a cover.
const MAX_PLACEHOLDER_PX = 2

type BookCoverProps = {
  src: string | null | undefined
  alt: string
  className?: string
  // Shown instead of the image when there's no usable picture.
  fallback: React.ReactNode
  loading?: 'lazy' | 'eager'
}

export function BookCover({ src, alt, className, fallback, loading = 'lazy' }: BookCoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  function check(img: HTMLImageElement) {
    if (img.naturalWidth <= MAX_PLACEHOLDER_PX && img.naturalHeight <= MAX_PLACEHOLDER_PX && src) {
      noPicture.add(src)
      setFailedSrc(src)
    }
  }

  // A cached image can finish loading before React attaches onLoad, so
  // check once after mount too.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) check(img)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  if (!src || failedSrc === src || noPicture.has(src)) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onLoad={(e) => check(e.currentTarget)}
      onError={() => {
        noPicture.add(src)
        setFailedSrc(src)
      }}
    />
  )
}
