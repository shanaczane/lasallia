// apps/web/components/login/SystemStatusModal.tsx
// Login footer's "System Status" link. Two real, checkable things rather
// than a decorative "all systems operational" — there's no incident-
// history/uptime-tracking infrastructure in this app, so this only ever
// reports what it can actually verify right now:
//   - API reachability, via a live GET /health.
//   - Whether the library is open right now, computed from the same
//     operating-hours fields the librarian Settings page manages
//     (GET /settings/public) — the same source core/calendar.py's fine
//     math already treats as authoritative.

'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, CheckCircle2, XCircle, Loader2, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchPublicLibrarySettings, type PublicLibrarySettings } from '@/lib/settings'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const HEALTH_CHECK_TIMEOUT_MS = 4000

type ApiStatus = 'checking' | 'operational' | 'unreachable'

type SystemStatusModalProps = {
  onClose: () => void
}

async function checkApiHealth(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_URL}/health`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// "HH:MM" or "HH:MM:SS" (both come back from the API) → "7:30 AM".
function formatClock(t: string): string {
  const [h, m] = t.split(':')
  return new Date(2000, 0, 1, Number(h), Number(m)).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

// Same weekday/Saturday/Sunday grouping core/calendar.py uses server-side
// for fine accrual — mirrored here client-side just to answer "open right
// now?", not to make any authoritative decision.
function hoursForToday(info: PublicLibrarySettings, day: number): [string | null, string | null] {
  if (day === 0) return [info.sunday_open_time, info.sunday_close_time]
  if (day === 6) return [info.saturday_open_time, info.saturday_close_time]
  return [info.weekday_open_time, info.weekday_close_time]
}

function libraryOpenNow(info: PublicLibrarySettings, now: Date): { open: boolean; detail: string } {
  const [openTime, closeTime] = hoursForToday(info, now.getDay())
  if (!openTime || !closeTime) return { open: false, detail: 'Closed today' }

  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const openMinutes = oh * 60 + om
  const closeMinutes = ch * 60 + cm

  if (minutesNow >= openMinutes && minutesNow < closeMinutes) {
    return { open: true, detail: `Closes at ${formatClock(closeTime)}` }
  }
  return { open: false, detail: `Opens at ${formatClock(openTime)}` }
}

function StatusRow({
  label,
  loading,
  ok,
  okLabel,
  downLabel,
  detail,
}: {
  label: string
  loading: boolean
  ok: boolean
  okLabel: string
  downLabel: string
  detail?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-(--radius) border border-ink-200 bg-white">
      <div className="min-w-0">
        <p className="text-ink-900 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          {label}
        </p>
        {detail && !loading && (
          <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            {detail}
          </p>
        )}
      </div>
      {loading ? (
        <Loader2 size={16} className="text-ink-300 animate-spin motion-reduce:animate-none shrink-0" />
      ) : (
        <span
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-pill font-semibold shrink-0',
            ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          )}
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)' }}
        >
          {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {ok ? okLabel : downLabel}
        </span>
      )}
    </div>
  )
}

export function SystemStatusModal({ onClose }: SystemStatusModalProps) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')
  const [libraryInfo, setLibraryInfo] = useState<PublicLibrarySettings | null>(null)
  const [libraryError, setLibraryError] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const runChecks = useCallback(() => {
    setApiStatus('checking')
    setLibraryError(false)
    checkApiHealth().then((ok) => {
      setApiStatus(ok ? 'operational' : 'unreachable')
      setLastChecked(new Date())
    })
    fetchPublicLibrarySettings()
      .then(setLibraryInfo)
      .catch(() => setLibraryError(true))
  }, [])

  useEffect(() => {
    runChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openState = libraryInfo ? libraryOpenNow(libraryInfo, new Date()) : null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-lg h-[85vh] sm:h-[480px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — same padding/shell as ContactSupportModal so the two
            login-footer modals read as one consistent size/system. */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 shrink-0">
              <Clock size={18} className="text-green-700" />
            </div>
            <p
              className="text-ink-900 font-semibold"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
            >
              System Status
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 text-ink-400 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — top-aligned, same as ContactSupportModal. */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-2.5">
          <StatusRow
            label="Website"
            loading={false}
            ok={true}
            okLabel="Operational"
            downLabel="Unreachable"
            detail="You're viewing it right now"
          />
          <StatusRow
            label="Sign-in & library services"
            loading={apiStatus === 'checking'}
            ok={apiStatus === 'operational'}
            okLabel="Operational"
            downLabel="Unreachable"
          />
          <StatusRow
            label="Library (physical)"
            loading={!libraryInfo && !libraryError}
            ok={!!openState?.open}
            okLabel="Open now"
            downLabel="Closed"
            detail={libraryError ? 'Hours unavailable' : openState?.detail}
          />

          <div className="flex items-center justify-between gap-3 mt-1">
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              {lastChecked
                ? `Last checked ${lastChecked.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
                : 'Checking…'}
            </p>
            <button
              type="button"
              onClick={runChecks}
              disabled={apiStatus === 'checking'}
              className="flex items-center gap-1.5 text-green-700 hover:text-green-900 font-medium transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
            >
              <RefreshCw size={13} className={cn(apiStatus === 'checking' && 'animate-spin motion-reduce:animate-none')} />
              Refresh
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full px-4 py-2.5 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
