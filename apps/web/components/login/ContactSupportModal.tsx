// apps/web/components/login/ContactSupportModal.tsx
// Login footer's "Contact Support" link. Three tabs: a static FAQ (answers
// the common cases before anyone needs a human), a ticket form (submits to
// POST /support-tickets and hands back a ticket number — see the librarian
// inbox at app/librarian/support/page.tsx), and a tracker for following up
// on one already submitted. Direct phone/email are pulled from the
// librarian-managed Settings page (GET /settings/public) so they're never
// a second, driftable copy of what a librarian actually set.

'use client'

import { useEffect, useState } from 'react'
import { X, Mail, Phone, ChevronDown, Loader2, CheckCircle2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchPublicLibrarySettings, type PublicLibrarySettings } from '@/lib/settings'
import { createSupportTicket, trackSupportTicket, type TicketCategory, type TicketStatusView, type SupportTicket } from '@/lib/supportTickets'

type ContactSupportModalProps = {
  onClose: () => void
}

type Tab = 'faq' | 'submit' | 'track'

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "I forgot my password / can't sign in — what do I do?",
    a: 'If you sign in with a DLSL email and password, use "Forgot password?" on the sign-in form. If you normally use "Continue with Google" instead, there\'s no separate Lasallia password to reset. Still stuck? Submit a ticket below and a librarian will help you regain access.',
  },
  {
    q: 'How do I borrow or reserve a book?',
    a: "Search the catalog, then Borrow (in person, scan your ID at the kiosk) or Reserve (holds a copy for pickup) directly from a book's page. You'll get a notification once a reservation is ready.",
  },
  {
    q: 'How do I check my due dates or renew a loan?',
    a: 'Your active loans and their due dates are on your Library page — renewals are available there too, up to the limit your account allows.',
  },
  {
    q: 'How do I pay an outstanding fine?',
    a: 'Fines are settled in person at the circulation desk, where a librarian records your receipt number against the loan. Any outstanding balance shows on your account.',
  },
  {
    q: 'I lost or damaged a book I borrowed — what now?',
    a: "Let a librarian know as soon as possible, either at the desk or by submitting a ticket below — don't wait for the due date to pass.",
  },
]

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'login', label: 'Login issue' },
  { value: 'technical', label: 'Technical bug' },
  { value: 'account', label: 'Account issue' },
  { value: 'other', label: 'Other' },
]

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 px-2 py-2 rounded-sm font-semibold transition-colors',
        active ? 'bg-green-700 text-white' : 'text-ink-500 hover:bg-ink-100'
      )}
      style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
    >
      {children}
    </button>
  )
}

function FaqTab({ contact }: { contact: { info: PublicLibrarySettings | null; error: string } }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {FAQ_ITEMS.map((item, i) => {
          const open = openIndex === i
          return (
            <div key={item.q} className="border border-ink-200 rounded-(--radius) overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex items-center justify-between gap-3 w-full text-left px-3.5 py-2.5 hover:bg-ink-50 transition-colors"
              >
                <span className="text-ink-900 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                  {item.q}
                </span>
                <ChevronDown size={15} className={cn('text-ink-400 shrink-0 transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <p
                  className="text-ink-600 leading-relaxed px-3.5 pb-3"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                >
                  {item.a}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t border-ink-100 pt-3.5 flex flex-col gap-2.5">
        <p className="text-ink-400 uppercase font-semibold" style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-caps)', fontFamily: 'var(--font-body)' }}>
          Prefer to reach us directly?
        </p>
        {contact.error && (
          <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>{contact.error}</p>
        )}
        {!contact.info && !contact.error && (
          <Loader2 size={15} className="text-ink-300 animate-spin motion-reduce:animate-none" />
        )}
        {contact.info && (
          <div className="flex flex-col gap-2">
            <a
              href={`mailto:${contact.info.contact_email}`}
              className="flex items-center gap-2.5 text-green-700 hover:text-green-900 transition-colors"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              <Mail size={15} className="shrink-0" />
              {contact.info.contact_email}
            </a>
            <a
              href={`tel:${contact.info.contact_number}`}
              className="flex items-center gap-2.5 text-green-700 hover:text-green-900 transition-colors"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              <Phone size={15} className="shrink-0" />
              {contact.info.contact_number}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function SubmitTab({ onTracked }: { onTracked: (ticketNumber: string, email: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState<TicketCategory>('other')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<SupportTicket | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const ticket = await createSupportTicket({ name: name.trim(), email: email.trim(), category, message: message.trim() })
      setCreated(ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your ticket')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCopy() {
    if (!created) return
    navigator.clipboard.writeText(created.ticket_number).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  if (created) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-success-bg">
          <CheckCircle2 size={24} className="text-success" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
            Ticket submitted
          </p>
          <p className="text-ink-500 mt-1" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            Save your ticket number to track its status — there&apos;s no email notification when it&apos;s updated.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 rounded-(--radius) border border-ink-200 hover:bg-ink-50 transition-colors"
        >
          <span className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)' }}>
            {created.ticket_number}
          </span>
          {copied ? <Check size={15} className="text-success" /> : <Copy size={15} className="text-ink-400" />}
        </button>
        <button
          type="button"
          onClick={() => onTracked(created.ticket_number, created.email)}
          className="text-green-700 hover:text-green-900 font-medium transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Track this ticket →
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-ink-700 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-ink-700 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-ink-700 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          What&apos;s this about?
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory)}
          className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 bg-white"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-ink-700 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          placeholder="Describe what's happening…"
          className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700 resize-none"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        />
      </div>

      {error && (
        <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 px-4 py-2.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-60"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        {submitting ? 'Submitting…' : 'Submit Ticket'}
      </button>
    </form>
  )
}

function TrackTab({ prefill }: { prefill: { ticketNumber: string; email: string } | null }) {
  const [ticketNumber, setTicketNumber] = useState(prefill?.ticketNumber ?? '')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TicketStatusView | null>(null)

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault()
    if (!ticketNumber.trim() || !email.trim()) return
    setTracking(true)
    setError('')
    setResult(null)
    try {
      setResult(await trackSupportTicket(ticketNumber.trim(), email.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No ticket found with that number and email')
    } finally {
      setTracking(false)
    }
  }

  const STATUS_LABEL: Record<string, { label: string; className: string }> = {
    open: { label: 'Open', className: 'bg-warn-bg text-warn' },
    in_progress: { label: 'In Progress', className: 'bg-info-bg text-info' },
    resolved: { label: 'Resolved', className: 'bg-success-bg text-success' },
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleTrack} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-ink-700 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Ticket number
          </label>
          <input
            type="text"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
            placeholder="LRC-000123"
            required
            className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm-body)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-ink-700 font-medium" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Email used to submit it
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-3 py-2 rounded-sm border border-ink-200 focus:outline-none focus:border-green-700"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          />
        </div>
        {error && <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>{error}</p>}
        <button
          type="submit"
          disabled={tracking}
          className="px-4 py-2.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-60"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          {tracking ? 'Looking up…' : 'Track Ticket'}
        </button>
      </form>

      {result && (
        <div className="border border-ink-200 rounded-(--radius) p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm-body)' }}>
              {result.ticket_number}
            </span>
            <span
              className={cn('px-2.5 py-0.5 rounded-pill font-semibold', STATUS_LABEL[result.status]?.className)}
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)' }}
            >
              {STATUS_LABEL[result.status]?.label ?? result.status}
            </span>
          </div>
          <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Submitted {new Date(result.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          {result.resolution_note && (
            <div className="border-t border-ink-100 pt-2 mt-1">
              <p className="text-ink-500 uppercase font-semibold mb-1" style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-caps)', fontFamily: 'var(--font-body)' }}>
                Note from the library
              </p>
              <p className="text-ink-700 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                {result.resolution_note}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ContactSupportModal({ onClose }: ContactSupportModalProps) {
  const [tab, setTab] = useState<Tab>('faq')
  const [contactInfo, setContactInfo] = useState<PublicLibrarySettings | null>(null)
  const [contactError, setContactError] = useState('')
  const [trackPrefill, setTrackPrefill] = useState<{ ticketNumber: string; email: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicLibrarySettings()
      .then((data) => { if (!cancelled) setContactInfo(data) })
      .catch((err) => { if (!cancelled) setContactError(err instanceof Error ? err.message : 'Could not load contact info') })
    return () => { cancelled = true }
  }, [])

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
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 shrink-0">
              <Mail size={18} className="text-green-700" />
            </div>
            <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
              Contact Support
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

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pb-4 shrink-0">
          <TabButton active={tab === 'faq'} onClick={() => setTab('faq')}>FAQ</TabButton>
          <TabButton active={tab === 'submit'} onClick={() => setTab('submit')}>Submit a Ticket</TabButton>
          <TabButton active={tab === 'track'} onClick={() => setTab('track')}>Track a Ticket</TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {tab === 'faq' && <FaqTab contact={{ info: contactInfo, error: contactError }} />}
          {tab === 'submit' && (
            <SubmitTab
              onTracked={(ticketNumber, email) => {
                setTrackPrefill({ ticketNumber, email })
                setTab('track')
              }}
            />
          )}
          {tab === 'track' && <TrackTab prefill={trackPrefill} />}
        </div>
      </div>
    </div>
  )
}
