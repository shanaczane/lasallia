// apps/web/app/librarian/catalog/[bookId]/page.tsx
// Fix: Add Copy wired to state, responsive layout, bigger cover

'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Hash, Building2, Calendar,
  BookOpen, Tag, Copy, Pencil, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBook } from '@/lib/hooks/useBooks'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'
import type { Book } from '@lasallia/types'
import { CopyManagementTable, type BookCopy, type CopyStatus } from '@/components/ui/catalog/CopyManagementTable'
import { BookFormModal, type BookFormData } from '@/components/ui/catalog/BookFormModal'
import { DeleteBookModal } from '@/components/ui/catalog/DeleteBookModal'
import { useRouter } from 'next/navigation'
import { archiveBook } from '@/lib/weeding'

// ─── Cover color helper ───────────────────────────────────────────────────────

const COVER_COLORS = [
  '#1E3A5F', '#5C3D11', '#1B3A2D', '#4A1942',
  '#2C3E50', '#1A1A2E', '#0F4C75', '#154360',
  '#1B2631', '#2E4057', '#3B1F2B', '#1C3144',
]

function getCoverColor(id: string, override?: string): string {
  if (override) return override
  const idx = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COVER_COLORS[idx % COVER_COLORS.length]
}

// ─── Mock copy data ───────────────────────────────────────────────────────────

function generateMockCopies(book: Book): BookCopy[] {
  const total = book.total_copies ?? 2
  const avail = book.available_copies ?? 1
  return Array.from({ length: total }, (_, i) => {
    const copyNum = i + 1
    const isCheckedOut = copyNum > avail
    return {
      id:            `${book.id.padStart(4, '0')}-C${String(copyNum).padStart(3, '0')}`,
      copy_number:   copyNum,
      status:        isCheckedOut ? 'checked_out' : 'available',
      borrower_name: isCheckedOut ? 'Juan Dela Cruz' : undefined,
      due_date:      isCheckedOut
        ? new Date(Date.now() + 5 * 86400000).toISOString()
        : undefined,
    } satisfies BookCopy
  })
}

// ─── Meta row ─────────────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-ink-100 last:border-b-0">
      <span className="text-ink-300 mt-0.5 shrink-0">{icon}</span>
      <span
        className="text-ink-500 shrink-0 w-28"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        {label}
      </span>
      <span
        className="text-ink-900 font-medium min-w-0 break-words"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-ink-400 uppercase font-semibold mb-3"
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-2xs)',
        letterSpacing: 'var(--tracking-section)',
      }}
    >
      {children}
    </p>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LibrarianBookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = use(params)
  const router = useRouter()

  const { book, loading } = useBook(bookId)

  const [editOpen,   setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [copies, setCopies] = useState<BookCopy[]>([])
  const [archiveError, setArchiveError] = useState('')

  // Per-copy tracking isn't backed by a real table yet — this regenerates
  // placeholder copy rows from total_copies/available_copies once the real
  // book loads. Replace once Sprint 5.2.4's copies table exists.
  useEffect(() => {
    if (book) setCopies(generateMockCopies(book))
  }, [book])

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto animate-pulse">
        <div className="h-4 w-32 bg-ink-100 rounded mb-6" />
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-7">
          <div className="shrink-0 rounded-(--radius) bg-ink-100" style={{ width: 140, height: 198 }} />
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="h-7 w-2/3 bg-ink-100 rounded" />
            <div className="h-4 w-1/3 bg-ink-100 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <p
          className="text-ink-700 font-semibold"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}
        >
          Book not found
        </p>
        <Link
          href="/librarian/catalog"
          className="flex items-center gap-2 text-green-700 hover:text-green-900 transition-colors font-medium"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}
        >
          <ArrowLeft size={16} />
          Back to catalog
        </Link>
      </div>
    )
  }

  const coverColor = getCoverColor(book.id, book.cover_color)
  const pillStatus = book.status === 'misplaced' ? 'missing' : book.status

  // ── Handlers ──

  function handleCopyStatusChange(copyId: string, newStatus: CopyStatus) {
    setCopies((prev) =>
      prev.map((c) => (c.id === copyId ? { ...c, status: newStatus } : c))
    )
  }

  function handleAddCopy(copy: BookCopy) {
    setCopies((prev) => [...prev, copy])
  }

  function handleEditSubmit(_data: BookFormData) {
    setEditOpen(false)
  }

  // Reports plan Phase 2 — the only one of these actions wired to a real
  // endpoint so far (edit/delete stay local-only, see the copies effect
  // above). Only navigates away once the archive actually succeeds.
  async function handleArchive(book: Book) {
    try {
      await archiveBook(book.id)
      router.push('/librarian/catalog')
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not archive this book.')
    }
  }

  function handleDelete(_book: Book) {
    router.push('/librarian/catalog')
  }

  const available   = copies.filter((c) => c.status === 'available').length
  const checkedOut  = copies.filter((c) => c.status === 'checked_out').length
  const underRepair = copies.filter((c) => c.status === 'under_repair').length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto">

      {/* Back link */}
      <Link
        href="/librarian/catalog"
        className="inline-flex items-center gap-1.5 text-ink-500 hover:text-green-700 transition-colors mb-6 font-medium"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        <ArrowLeft size={15} />
        Back to Catalog
      </Link>

      {archiveError && (
        <div
          className="mb-6 px-4 py-3 rounded-(--radius) border border-danger bg-danger-bg text-danger flex items-center justify-between gap-3"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          {archiveError}
          <button type="button" onClick={() => setArchiveError('')} className="font-semibold hover:underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="flex flex-col sm:flex-row gap-5 sm:gap-7 mb-8">

        {/* Cover — bigger on detail page */}
        <div
          className="shrink-0 rounded-(--radius) overflow-hidden shadow-(--shadow) self-start relative"
          style={{
            width: 140,
            height: 198,
            background: coverColor,
            minWidth: 140,
          }}
        >
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.cover_url}
              alt={`Cover of ${book.title}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id={`dp-${book.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.6" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#dp-${book.id})`} />
              </svg>
              <div className="absolute inset-0 flex flex-col justify-between p-3">
                <p
                  className="text-white/60 uppercase font-semibold leading-tight line-clamp-2"
                  style={{ fontSize: '0.55rem', letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}
                >
                  {book.author}
                </p>
                <p
                  className="text-white font-semibold leading-snug line-clamp-4"
                  style={{ fontSize: '0.75rem', fontFamily: 'var(--font-display)' }}
                >
                  {book.title}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">

          {/* Title + actions row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1
                className="text-ink-900 leading-tight"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)' }}
              >
                {book.title}
              </h1>
              <p
                className="text-ink-500 mt-1"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-lg)' }}
              >
                {book.author}
              </p>
              {book.published_year && (
                <p
                  className="text-ink-400 mt-0.5"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                >
                  {book.publisher ? `${book.publisher}, ` : ''}
                  {book.published_year}
                </p>
              )}
            </div>

            {/* Edit / Remove — stack vertically on very narrow, row on sm+ */}
            <div className="flex flex-row sm:flex-row items-center gap-2 shrink-0 mt-1">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-ink-200 text-ink-700 bg-white hover:bg-ink-50 transition-colors font-medium"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                <Pencil size={14} />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-sm border border-ink-200 text-[#B91C1C] bg-white hover:bg-[#FEE2E2] transition-colors font-medium"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                <Trash2 size={14} />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <AvailabilityPill status={pillStatus} />
            {book.category && (
              <span
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-600 font-medium"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                <Tag size={10} />
                {book.category}
              </span>
            )}
            {book.format && (
              <span
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-600 font-medium capitalize"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                <BookOpen size={10} />
                {book.format}
              </span>
            )}
          </div>

          {/* Copy summary pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {[
              { label: 'Available',    count: available,   cls: 'text-[#16A34A] bg-[#DCFCE7]' },
              { label: 'Checked Out',  count: checkedOut,  cls: 'text-[#0369A1] bg-[#E0F2FE]' },
              { label: 'Under Repair', count: underRepair, cls: 'text-[#C2730A] bg-[#FEF3C7]' },
            ].map(({ label, count, cls }) => (
              <span
                key={label}
                className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold', cls)}
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                <Copy size={11} />
                {count} {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Two-column metadata ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Bibliographic */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
          <SectionHeading>Bibliographic Info</SectionHeading>
          {book.isbn && (
            <MetaRow
              icon={<Hash size={14} />}
              label="ISBN"
              value={<span style={{ fontFamily: 'var(--font-mono)' }}>{book.isbn}</span>}
            />
          )}
          {book.publisher && (
            <MetaRow icon={<Building2 size={14} />} label="Publisher" value={book.publisher} />
          )}
          {book.published_year && (
            <MetaRow icon={<Calendar size={14} />} label="Year" value={book.published_year} />
          )}
          {book.subject && (
            <MetaRow icon={<Tag size={14} />} label="Subject" value={book.subject} />
          )}
        </div>

        {/* Location & Admin */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
          <SectionHeading>Location & Admin Data</SectionHeading>
          <MetaRow
            icon={<Hash size={14} />}
            label="Call Number"
            value={<span style={{ fontFamily: 'var(--font-mono)' }}>{book.call_number}</span>}
          />
          <MetaRow icon={<MapPin size={14} />} label="Location" value={book.shelf_location} />
          {book.total_copies !== undefined && (
            <MetaRow
              icon={<Copy size={14} />}
              label="Copies"
              value={
                <span>
                  <span className="font-bold">{available}</span>
                  {' / '}
                  {copies.length} available
                </span>
              }
            />
          )}
          <MetaRow
            icon={<Calendar size={14} />}
            label="Acquired"
            value={new Date(book.created_at).toLocaleDateString('en-PH', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          />
          <MetaRow
            icon={<Calendar size={14} />}
            label="Last Updated"
            value={new Date(book.updated_at).toLocaleDateString('en-PH', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          />
        </div>
      </div>

      {/* Abstract */}
      {book.abstract && (
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5 mb-6">
          <SectionHeading>Abstract</SectionHeading>
          <p
            className="text-ink-700 leading-relaxed"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}
          >
            {book.abstract}
          </p>
        </div>
      )}

      {/* ── Copy Management (5.2.4) ── */}
      <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <SectionHeading>Copy Management</SectionHeading>
        </div>

        <CopyManagementTable
          copies={copies}
          bookId={book.id}
          onStatusChange={handleCopyStatusChange}
          onAddCopy={handleAddCopy}
        />
      </div>

      {/* Modals */}
      <BookFormModal
        mode="edit"
        book={book}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
      />
      <DeleteBookModal
        book={book}
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />
    </div>
  )
}