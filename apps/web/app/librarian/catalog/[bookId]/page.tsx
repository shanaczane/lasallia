// apps/web/app/librarian/catalog/[bookId]/page.tsx
// Sprint 5.2.1 — Librarian catalog view with admin metadata
// Sprint 5.2.3 — Edit form trigger from detail page
// Sprint 5.2.4 — Copy management table (per-copy status)
// Sprint 5.2.5 — Delete / archive from detail page

'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Hash, Building2, Calendar,
  BookOpen, Tag, Copy, Pencil, Trash2, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_BOOKS } from '@/lib/mock/catalog'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'
import type { Book } from '@lasallia/types'
import { CopyManagementTable, type BookCopy, type CopyStatus } from '@/components/ui/catalog/CopyManagementTable'
import { BookFormModal, type BookFormData } from '@/components/ui/catalog/BookFormModal'
import { DeleteBookModal } from '@/components/ui/catalog/DeleteBookModal'
import { useRouter } from 'next/navigation'

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
      id:           `${book.id.padStart(4, '0')}-C${String(copyNum).padStart(3, '0')}`,
      copy_number:  copyNum,
      status:       isCheckedOut ? 'checked_out' : 'available',
      borrower_name: isCheckedOut ? 'Juan Dela Cruz' : undefined,
      due_date:      isCheckedOut
        ? new Date(Date.now() + 5 * 86400000).toISOString()
        : undefined,
    } satisfies BookCopy
  })
}

// ─── Meta row helper ──────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-ink-100 last:border-b-0">
      <span className="text-ink-300 mt-0.5 shrink-0">{icon}</span>
      <span
        className="text-ink-500 shrink-0 w-32"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        {label}
      </span>
      <span
        className="text-ink-900 font-medium"
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

export default function LibrarianBookDetailPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params)
  const router = useRouter()

  const book = MOCK_BOOKS.find((b) => b.id === bookId)

  const [editOpen,   setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [copies, setCopies] = useState<BookCopy[]>(() =>
    book ? generateMockCopies(book) : []
  )

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
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

  function handleCopyStatusChange(copyId: string, newStatus: CopyStatus) {
    setCopies((prev) => prev.map((c) => c.id === copyId ? { ...c, status: newStatus } : c))
  }

  function handleEditSubmit(_data: BookFormData) {
    // In production: PATCH /api/books/:id — here we just close
    setEditOpen(false)
  }

  function handleArchive(_book: Book) {
    router.push('/librarian/catalog')
  }

  function handleDelete(_book: Book) {
    router.push('/librarian/catalog')
  }

  const available   = copies.filter((c) => c.status === 'available').length
  const checkedOut  = copies.filter((c) => c.status === 'checked_out').length
  const underRepair = copies.filter((c) => c.status === 'under_repair').length

  return (
    <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto">

      {/* Back link */}
      <Link
        href="/librarian/catalog"
        className="inline-flex items-center gap-1.5 text-ink-500 hover:text-green-700 transition-colors mb-6 font-medium"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        <ArrowLeft size={15} />
        Back to Catalog
      </Link>

      {/* ── Hero ── */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        {/* Cover */}
        <div
          className="shrink-0 rounded-(--radius) overflow-hidden shadow-(--shadow)"
          style={{ width: 120, height: 170, background: coverColor, minWidth: 120 }}
        >
          {book.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.cover_url} alt={`Cover of ${book.title}`} className="w-full h-full object-cover" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
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
                  {book.publisher ? `${book.publisher}, ` : ''}{book.published_year}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-sm border border-ink-200 text-ink-700 bg-white hover:bg-ink-50 transition-colors font-medium"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-sm border border-ink-200 text-danger bg-white hover:bg-[#FEE2E2] transition-colors font-medium"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>
          </div>

          {/* Status + category row */}
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

          {/* Copy summary pills — admin-only */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {[
              { label: 'Available',    count: available,   color: 'text-[#16A34A] bg-[#DCFCE7]' },
              { label: 'Checked Out',  count: checkedOut,  color: 'text-[#0369A1] bg-[#E0F2FE]' },
              { label: 'Under Repair', count: underRepair, color: 'text-[#C2730A] bg-[#FEF3C7]' },
            ].map(({ label, count, color }) => (
              <span
                key={label}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold',
                  color
                )}
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                <Copy size={11} />
                {count} {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Two-column detail ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Bibliographic info */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
          <SectionHeading>Bibliographic Info</SectionHeading>
          <div>
            {book.isbn && (
              <MetaRow icon={<Hash size={14} />} label="ISBN" value={
                <span style={{ fontFamily: 'var(--font-mono)' }}>{book.isbn}</span>
              } />
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
        </div>

        {/* Location & Admin */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
          <SectionHeading>Location & Admin Data</SectionHeading>
          <div>
            <MetaRow icon={<Hash size={14} />} label="Call Number" value={
              <span style={{ fontFamily: 'var(--font-mono)' }}>{book.call_number}</span>
            } />
            <MetaRow icon={<MapPin size={14} />} label="Location" value={book.shelf_location} />
            {book.total_copies !== undefined && (
              <MetaRow icon={<Copy size={14} />} label="Total Copies" value={
                <span>
                  <span className="font-bold">{book.available_copies ?? 0}</span>
                  {' / '}
                  {book.total_copies} available
                </span>
              } />
            )}
            <MetaRow icon={<Calendar size={14} />} label="Acquired" value={
              new Date(book.created_at).toLocaleDateString('en-PH', {
                year: 'numeric', month: 'long', day: 'numeric',
              })
            } />
            <MetaRow icon={<Calendar size={14} />} label="Last Updated" value={
              new Date(book.updated_at).toLocaleDateString('en-PH', {
                year: 'numeric', month: 'long', day: 'numeric',
              })
            } />
          </div>
        </div>
      </div>

      {/* Abstract */}
      {book.abstract && (
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5 mb-8">
          <SectionHeading>Abstract</SectionHeading>
          <p
            className="text-ink-700 leading-relaxed"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}
          >
            {book.abstract}
          </p>
        </div>
      )}

      {/* ── Copy management table (5.2.4) ── */}
      <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <SectionHeading>Copy Management</SectionHeading>
            <p
              className="text-ink-500 -mt-2"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {copies.length} {copies.length === 1 ? 'copy' : 'copies'} registered
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-ink-200 text-ink-700 bg-white hover:bg-ink-50 transition-colors font-medium shrink-0"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <Package size={13} />
            Add Copy
          </button>
        </div>

        <CopyManagementTable
          copies={copies}
          onStatusChange={handleCopyStatusChange}
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