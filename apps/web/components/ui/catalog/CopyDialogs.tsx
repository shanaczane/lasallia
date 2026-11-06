// Librarian dialogs for a book's physical copies: showing the accession
// numbers a save assigned, adding copies, registering a copy that already
// has a number printed on it, and correcting a copy's number.

'use client'

import { useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, Check, Copy, Hash, Printer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'
import {
  BookApiError, addCopiesToBook, correctAccessionNumber, registerExistingCopy,
  type AccessionPrefix, type BookCopy, type BookWithNewCopies,
} from '@/lib/books'

const body = { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' } as const
const small = { fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' } as const
const mono = { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm-body)' } as const

const inputClass =
  'w-full rounded-sm border border-ink-200 bg-white px-3 py-2 text-ink-900 placeholder:text-ink-300 ' +
  'focus:outline-none focus:border-green-700 focus:ring-1 focus:ring-green-700'

const primaryButton =
  'px-5 py-2 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const secondaryButton =
  'px-4 py-2 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

// ─── Shell ────────────────────────────────────────────────────────────────────

function DialogShell({
  open, onClose, title, subtitle, icon, children, footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon: React.ReactNode
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(dialogRef, { open, onClose })
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-210 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-md p-6 flex flex-col gap-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-50 text-green-700 shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                {title}
              </p>
              {subtitle && (
                <p className="text-ink-500 mt-0.5 leading-snug line-clamp-1" style={body}>{subtitle}</p>
              )}
            </div>
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
        {children}
        <div className="flex flex-wrap items-center justify-end gap-3">{footer}</div>
      </div>
    </div>
  )
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-1.5 text-danger" style={small} role="alert">
      <AlertCircle size={13} className="mt-px shrink-0" /> {message}
    </p>
  )
}

// Shown when a number is more than 1,000 above the counter.
function LargeJumpWarning({ accession, nextValue }: { accession: string; nextValue?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-sm border border-gold-500 bg-gold-100 px-3 py-2.5 text-ink-900" style={body}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-gold-600" />
      <p className="leading-snug">
        <span style={mono} className="font-semibold">{accession}</span> is more than 1,000 above the next accession
        number{nextValue ? <> (<span style={mono}>{nextValue}</span>)</> : null}. Saving it moves the counter past it for
        good. Check the label on the book, then confirm.
      </p>
    </div>
  )
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// ─── Assigned numbers ─────────────────────────────────────────────────────────

// After a save that created copies: the numbers to write or print on the books.
export function AssignedNumbersDialog({
  result, onClose,
}: {
  result: { title: string; numbers: string[] } | null
  onClose: () => void
}) {
  // Keyed by the numbers, so "Copied" starts fresh for each save.
  if (!result) return null
  return <AssignedNumbersBody key={result.numbers.join(',')} result={result} onClose={onClose} />
}

function AssignedNumbersBody({
  result, onClose,
}: {
  result: { title: string; numbers: string[] }
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const numbers = result.numbers
  const asText = [result.title, ...numbers].join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function print() {
    const win = window.open('', '_blank', 'width=480,height=640')
    if (!win) return
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Accession numbers</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#14150f}h1{font-size:16px;margin:0 0 4px}
p{font-size:12px;color:#555;margin:0 0 16px}ol{padding-left:20px}li{font:600 18px ui-monospace,monospace;margin:6px 0}</style>
</head><body><h1>${escapeHtml(result.title)}</h1><p>${numbers.length} ${numbers.length === 1 ? 'copy' : 'copies'}. Write each number on its book.</p>
<ol>${numbers.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol></body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      title={numbers.length === 1 ? 'Accession number assigned' : 'Accession numbers assigned'}
      subtitle={result.title}
      icon={<Hash size={18} />}
      footer={
        <>
          <button type="button" onClick={copy} className={cn(secondaryButton, 'flex items-center gap-1.5')} style={body}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={print} className={cn(secondaryButton, 'flex items-center gap-1.5')} style={body}>
            <Printer size={14} /> Print
          </button>
          <button type="button" onClick={onClose} className={primaryButton} style={body}>Done</button>
        </>
      }
    >
      <p className="text-ink-600 leading-snug" style={body}>
        Write {numbers.length === 1 ? 'this number on the book' : 'one number on each copy'} before shelving.
        {numbers.length > 1 ? ' They are in order, one per copy.' : ''}
      </p>
      <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {numbers.map((n) => (
          <li key={n} className="rounded-sm border border-ink-200 bg-ink-50 px-3 py-2 text-center font-semibold text-ink-900" style={mono}>
            {n}
          </li>
        ))}
      </ol>
    </DialogShell>
  )
}

// ─── Add copies ───────────────────────────────────────────────────────────────

function AddCopiesDialogBody({
  book, open, onClose, onAdded,
}: {
  book: { id: string; title: string }
  open: boolean
  onClose: () => void
  onAdded: (result: BookWithNewCopies) => void
}) {
  const [count, setCount] = useState('1')
  const [prefix, setPrefix] = useState<AccessionPrefix>('T')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      setError('Enter 1 to 50 copies.')
      return
    }
    setSaving(true)
    setError('')
    try {
      onAdded(await addCopiesToBook(book.id, n, prefix))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add copies.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Add copies"
      subtitle={book.title}
      icon={<Hash size={18} />}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton} style={body}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={primaryButton} style={body}>
            {saving ? 'Adding…' : 'Add copies'}
          </button>
        </>
      }
    >
      <p className="text-ink-600 leading-snug" style={body}>
        New copies get the next accession numbers automatically. For a copy that already has a number printed on it,
        use Register existing copy instead.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-ink-700 font-medium" style={body}>Number of copies</span>
          <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} style={body} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-700 font-medium" style={body}>Prefix</span>
          <select value={prefix} onChange={(e) => setPrefix(e.target.value as AccessionPrefix)} className={inputClass} style={body}>
            <option value="T">T: general collection</option>
            <option value="GS">GS: Graduate School</option>
          </select>
        </label>
      </div>
      {error && <ErrorLine message={error} />}
    </DialogShell>
  )
}

// ─── Register existing copy ───────────────────────────────────────────────────

function RegisterCopyDialogBody({
  book, open, onClose, onRegistered,
}: {
  book: { id: string; title: string }
  open: boolean
  onClose: () => void
  onRegistered: (copy: BookCopy) => void
}) {
  const [accession, setAccession] = useState('')
  const [error, setError] = useState('')
  const [jump, setJump] = useState<{ accession: string; nextValue?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const value = accession.trim()
    if (!value) {
      setError('Type the number printed on the book.')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Confirming only applies to the exact number that was warned about.
      const confirmed = jump !== null && jump.accession === value.toUpperCase()
      onRegistered(await registerExistingCopy(book.id, value, confirmed))
    } catch (err) {
      if (err instanceof BookApiError && err.code === 'large_jump') {
        setJump({ accession: value.toUpperCase(), nextValue: err.nextValue })
      } else {
        setError(err instanceof Error ? err.message : 'Could not register this copy.')
      }
    } finally {
      setSaving(false)
    }
  }

  const confirming = jump !== null && jump.accession === accession.trim().toUpperCase()

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Register existing copy"
      subtitle={book.title}
      icon={<Hash size={18} />}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton} style={body}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={primaryButton} style={body}>
            {saving ? 'Saving…' : confirming ? 'Confirm and register' : 'Register copy'}
          </button>
        </>
      }
    >
      <p className="text-ink-600 leading-snug" style={body}>
        For a copy that already has an accession number on its label. Type it exactly as printed.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-ink-700 font-medium" style={body}>Accession number</span>
        <input
          type="text"
          value={accession}
          onChange={(e) => setAccession(e.target.value)}
          placeholder="e.g. T44869"
          autoFocus
          className={cn(inputClass, error && 'border-danger')}
          style={mono}
        />
      </label>
      {confirming && jump && <LargeJumpWarning accession={jump.accession} nextValue={jump.nextValue} />}
      {error && <ErrorLine message={error} />}
    </DialogShell>
  )
}

// ─── Correct a copy's number ──────────────────────────────────────────────────

function CorrectAccessionDialogBody({
  copy, open, onClose, onCorrected,
}: {
  copy: BookCopy | null
  open: boolean
  onClose: () => void
  onCorrected: () => void
}) {
  const [accession, setAccession] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [jump, setJump] = useState<{ accession: string; nextValue?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!copy) return
    const value = accession.trim()
    if (!value) { setError('Type the correct accession number.'); return }
    if (!reason.trim()) { setError('Give a reason for the correction.'); return }
    setSaving(true)
    setError('')
    try {
      const confirmed = jump !== null && jump.accession === value.toUpperCase()
      await correctAccessionNumber(copy.id, value, reason.trim(), confirmed)
      onCorrected()
    } catch (err) {
      if (err instanceof BookApiError && err.code === 'large_jump') {
        setJump({ accession: value.toUpperCase(), nextValue: err.nextValue })
      } else {
        setError(err instanceof Error ? err.message : 'Could not correct this number.')
      }
    } finally {
      setSaving(false)
    }
  }

  const confirming = jump !== null && jump.accession === accession.trim().toUpperCase()

  return (
    <DialogShell
      open={open && copy !== null}
      onClose={onClose}
      title="Correct accession number"
      subtitle={copy ? `Currently ${copy.accession_number}` : undefined}
      icon={<Hash size={18} />}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton} style={body}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={primaryButton} style={body}>
            {saving ? 'Saving…' : confirming ? 'Confirm correction' : 'Save correction'}
          </button>
        </>
      }
    >
      <p className="text-ink-600 leading-snug" style={body}>
        Only for fixing a mistake, such as a typo or a misread label. The old number, new number, reason, your name
        and the time are kept.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-ink-700 font-medium" style={body}>Correct accession number</span>
        <input
          type="text"
          value={accession}
          onChange={(e) => setAccession(e.target.value)}
          placeholder="e.g. T44869"
          autoFocus
          className={inputClass}
          style={mono}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-700 font-medium" style={body}>
          Reason <span className="text-danger">*</span>
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Typed T45130 instead of T45013"
          className={cn(inputClass, 'resize-none')}
          style={body}
        />
      </label>
      {confirming && jump && <LargeJumpWarning accession={jump.accession} nextValue={jump.nextValue} />}
      {error && <ErrorLine message={error} />}
    </DialogShell>
  )
}

// Each dialog's fields start empty every time it opens: the body is only
// mounted while open.
export function AddCopiesDialog(props: Parameters<typeof AddCopiesDialogBody>[0]) {
  return props.open ? <AddCopiesDialogBody {...props} /> : null
}

export function RegisterCopyDialog(props: Parameters<typeof RegisterCopyDialogBody>[0]) {
  return props.open ? <RegisterCopyDialogBody {...props} /> : null
}

export function CorrectAccessionDialog(props: Parameters<typeof CorrectAccessionDialogBody>[0]) {
  return props.open && props.copy ? <CorrectAccessionDialogBody {...props} /> : null
}
