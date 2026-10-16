// apps/web/app/borrow/start/page.tsx
// Where "Borrow this book" goes on a phone or tablet (see lib/device.ts)
// instead of opening the QR modal — there's no second screen to scan it
// from. Claims the hold right here, behind the same spinner the borrow form
// shows while loading, then replaces itself with /borrow/[token] so the
// whole thing reads as one page and Back skips this step.

'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, RotateCcw, WifiOff } from 'lucide-react'
import { openSessionFromToken, claimHold, NetworkError } from '@/lib/kiosk'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--color-paper)' }}>
      <div className="w-8 h-8 rounded-full border-2 border-green-700 border-t-transparent animate-spin motion-reduce:animate-none" />
    </div>
  )
}

function StartBorrow() {
  const router = useRouter()
  const bookId = useSearchParams().get('book')
  const backHref = bookId ? `/user/catalog/${bookId}` : '/user/catalog'

  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null)

  // Claiming takes the only available copy of a single-copy title, so it
  // must run once — the ref survives Strict Mode's double-invoked effect.
  const startedRef = useRef(false)

  async function claim() {
    if (!bookId) {
      setError({ message: 'No book was picked to borrow.', retryable: false })
      return
    }
    setError(null)
    try {
      const session = await openSessionFromToken()
      const hold = await claimHold(bookId, session.id)
      router.replace(`/borrow/${hold.token}`)
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Could not start borrowing this book',
        retryable: err instanceof NetworkError,
      })
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    claim()
    // Runs once — see startedRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!error) return <Spinner />

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }}>
      <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center">
        {error.retryable
          ? <WifiOff size={26} className="text-ink-400" />
          : <AlertCircle size={26} className="text-ink-400" />}
      </div>
      <div>
        <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>
          Couldn&apos;t start borrowing
        </p>
        <p className="text-ink-500 max-w-xs" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          {error.message}
        </p>
      </div>
      {error.retryable && (
        <button
          type="button"
          onClick={claim}
          className="flex items-center justify-center gap-2 px-6 h-11 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <RotateCcw size={15} />
          Try again
        </button>
      )}
      <Link
        href={backHref}
        className="flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
      >
        <ArrowLeft size={14} />
        Back to the book
      </Link>
    </div>
  )
}

export default function StartBorrowPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <StartBorrow />
    </Suspense>
  )
}
