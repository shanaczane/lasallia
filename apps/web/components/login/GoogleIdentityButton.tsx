// Google's own sign-in button, so Google's screen shows our site instead of
// the Supabase address. Only used when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set.
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { roleRedirect, signInWithGoogleIdToken } from '@/lib/auth'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

type GoogleId = {
  initialize: (config: {
    client_id: string
    callback: (response: { credential: string }) => void
    nonce: string
    hd?: string
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
  }) => void
  renderButton: (el: HTMLElement, options: Record<string, string | number>) => void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

function loadGis(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const script = existing ?? Object.assign(document.createElement('script'), { src: GIS_SRC, async: true, defer: true })
    script.addEventListener('load', () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in failed to load'))))
    script.addEventListener('error', () => reject(new Error('Google sign-in failed to load')))
    if (!existing) document.head.appendChild(script)
  })
}

// A one-time value (Google gets its hash, Supabase checks the original), so
// a stolen token can't be reused.
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return { raw, hashed }
}

export function GoogleIdentityButton({ clientId, onError }: { clientId: string; onError: (message: string) => void }) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const onErrorRef = useRef(onError)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    let cancelled = false
    Promise.all([loadGis(), makeNonce()])
      .then(([gis, nonce]) => {
        if (cancelled || !containerRef.current) return
        gis.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          // Only filters Google's account list; the server decides the role.
          hd: 'dlsl.edu.ph',
          ux_mode: 'popup',
          auto_select: false,
          callback: async ({ credential }) => {
            setSigningIn(true)
            try {
              const user = await signInWithGoogleIdToken(credential, nonce.raw)
              router.replace(roleRedirect(user.role))
            } catch (err: unknown) {
              onErrorRef.current(err instanceof Error ? err.message : 'Google sign-in failed.')
              setSigningIn(false)
            }
          },
        })
        gis.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.min(containerRef.current.offsetWidth || 320, 400),
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) onErrorRef.current(err instanceof Error ? err.message : 'Google sign-in failed to load')
      })
    return () => { cancelled = true }
  }, [clientId, router])

  return (
    <div className="relative flex w-full justify-center min-h-11">
      <div ref={containerRef} className={signingIn ? 'invisible w-full flex justify-center' : 'w-full flex justify-center'} />
      {signingIn && (
        <span
          className="absolute inset-0 flex items-center justify-center gap-2 text-ink-700"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> Signing you in…
        </span>
      )}
    </div>
  )
}
