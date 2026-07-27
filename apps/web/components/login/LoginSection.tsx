// components/login/LoginSection.tsx
// Compact single-form login (Variant A) — no role selector; the server
// determines the role from the login response and the redirect follows it.
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSignIn } from '@/lib/hooks/useSignIn'

const DLSL_EMAIL_PATTERN = /^[^\s@]+@dlsl\.edu\.ph$/i

export default function LoginSection() {
  const { signIn, loading, error, setError } = useSignIn()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailDomainHint, setEmailDomainHint] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setEmail(value)
    if (emailError) setEmailError('')
    if (emailDomainHint && DLSL_EMAIL_PATTERN.test(value)) setEmailDomainHint(false)
  }

  function handleEmailBlur() {
    setEmailDomainHint(email.length > 0 && !DLSL_EMAIL_PATTERN.test(email))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!DLSL_EMAIL_PATTERN.test(email)) {
      setEmailError('Use your @dlsl.edu.ph email')
      return
    }
    setEmailError('')

    await signIn(email, password)
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: 'var(--color-ink-900)' }}>

      {/* Background photo — desktop/tablet only; the mobile card covers the full viewport */}
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden sm:block"
        style={{
          backgroundImage: `url('/DeLaSalleLip_LRC Banner.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 hidden sm:block bg-black/55 backdrop-blur-sm" />

      {/* Centering layer */}
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center sm:px-4 sm:py-5">
        <div
          className={cn(
            'flex w-full flex-col justify-center bg-white',
            'min-h-screen p-6',
            'sm:min-h-0 sm:max-w-(--max-w-form) sm:justify-start sm:rounded-3xl sm:p-6 sm:shadow-(--shadow-lg)'
          )}
        >
          {/* Branding header */}
          <div className="mb-4 flex flex-col items-center text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border border-ink-200 bg-white shadow-(--shadow-sm)">
              <img
                src="/DeLaSalleLipa_Seal.png"
                alt="De La Salle Lipa"
                className="h-12 w-12 object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
            <span className="text-ink-900 font-bold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}>
              Lasallia
            </span>
            <span
              className="mt-0.5 text-green-700 font-bold uppercase"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-eyebrow)' }}
            >
              De La Salle Lipa · LRC
            </span>
          </div>

          <div className="mb-4 text-center">
            <h1
              className="text-ink-900 font-bold"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xl)' }}
            >
              Sign in
            </h1>
            <p
              className="mt-1 text-ink-400"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              Access your library account to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className={cn('mb-1 block font-semibold', emailError || error ? 'text-danger' : 'text-ink-900')}
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                DLSL email
              </label>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  suppressHydrationWarning
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                  placeholder="juandelacruz@dlsl.edu.ph"
                  className={cn(
                    'w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-ink-900 placeholder:text-ink-300',
                    'focus:outline-none transition-colors motion-reduce:transition-none',
                    emailError || error
                      ? 'border-danger focus:shadow-(--shadow-focus-danger)'
                      : 'border-ink-200 focus:border-green-700 focus:shadow-(--shadow-focus-green)'
                  )}
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                />
              </div>
              {emailError ? (
                <p className="mt-1" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>
                  {emailError}
                </p>
              ) : emailDomainHint ? (
                <p className="mt-1" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-warn)' }}>
                  Use your @dlsl.edu.ph email
                </p>
              ) : null}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className={cn('mb-1 block font-semibold', error ? 'text-danger' : 'text-ink-900')}
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  suppressHydrationWarning
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={cn(
                    'w-full rounded-xl border bg-white py-2.5 pl-9 pr-10 text-ink-900 placeholder:text-ink-300',
                    'focus:outline-none transition-colors motion-reduce:transition-none',
                    error
                      ? 'border-danger focus:shadow-(--shadow-focus-danger)'
                      : 'border-ink-200 focus:border-green-700 focus:shadow-(--shadow-focus-green)'
                  )}
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                />
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 rounded-sm"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="remember-me"
                className="flex items-center gap-2 text-ink-700 cursor-pointer select-none"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
              >
                <span className="relative inline-flex">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors',
                      'bg-ink-400 border-ink-400',
                      'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-green-700 peer-focus-visible:ring-offset-1'
                    )}
                  >
                    {rememberMe && <Check size={11} className="text-white" strokeWidth={3} />}
                  </span>
                </span>
                Remember me
              </label>
              <button
                type="button"
                suppressHydrationWarning
                className="text-green-700 hover:text-green-900 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 rounded-sm"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
              >
                Forgot password?
              </button>
            </div>

            {/* Auth error */}
            {error && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-danger"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
              >
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              suppressHydrationWarning
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 font-semibold text-white transition-colors hover:bg-green-800 active:bg-green-900 disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 motion-reduce:transition-none"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {loading && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Guest link */}
          <div className="mt-3 text-center text-ink-700" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
            Just browsing?{' '}
            <Link
              href="/guest/catalog"
              className="text-green-700 hover:text-green-900 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 rounded-sm"
            >
              Explore the catalog as guest →
            </Link>
          </div>

          {/* Footer */}
          <div className="mt-4 border-t border-ink-100 pt-3 text-center">
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)' }}>
              <button type="button" suppressHydrationWarning className="hover:text-ink-700 transition-colors">
                Contact Support
              </button>
              <span className="mx-1.5">|</span>
              <button type="button" suppressHydrationWarning className="hover:text-ink-700 transition-colors">
                System Status
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
