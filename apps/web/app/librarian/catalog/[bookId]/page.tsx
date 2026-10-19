// Librarian book page: details, copies, and edit/archive actions.

'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Hash, Building2, Calendar,
  BookOpen, GraduationCap, Landmark, Copy, Pencil, Trash2,
  Banknote, Store, HandCoins, Layers, StickyNote, Barcode, Ruler, Globe,
  Tags, Library, BookMarked, Type, CalendarPlus, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { programLabel } from '@/lib/programLabels'
import { useBook } from '@/lib/hooks/useBooks'
import { AvailabilityPill, pillStatusFor } from '@/components/ui/pills/availability-pill'
import type { Book } from '@lasallia/types'
import { CopyManagementTable } from '@/components/ui/catalog/CopyManagementTable'
import { BookFormModal, type BookFormData } from '@/components/ui/catalog/BookFormModal'
import { DeleteBookModal } from '@/components/ui/catalog/DeleteBookModal'
import { useRouter } from 'next/navigation'
import { archiveBook } from '@/lib/weeding'
import { fetchBookCopies, markCopyFound, updateBook, uploadBookCover, type BookCopy } from '@/lib/books'
import { bookFormDataToPayload } from '@/lib/bookForm'
import { copyStatusConfig, COPY_STATUSES } from '@/lib/copyStatus'
import { BookCover } from '@/components/ui/catalog/BookCover'

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

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const FUNDING_LABEL: Record<NonNullable<Book['funding_source']>, string> = {
  purchased: 'Purchased', donated: 'Donated', grant: 'Grant',
}

// e.g. "348 pages : illustrations ; 28 cm".
function physicalDescription(book: Book): string | null {
  const parts = [book.physical_extent, book.physical_illustrations, book.physical_dimensions]
  if (!parts.some(Boolean)) return null
  let out = book.physical_extent ?? ''
  if (book.physical_illustrations) out += (out ? ' : ' : '') + book.physical_illustrations
  if (book.physical_dimensions) out += (out ? ' ; ' : '') + book.physical_dimensions
  return out
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

  const { book, loading, refetch } = useBook(bookId)

  const [editOpen,   setEditOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [editError, setEditError] = useState('')

  // The book's copies, for the copy table and the missing-copies banner.
  const [copies, setCopies] = useState<BookCopy[]>([])
  useEffect(() => {
    if (!book) return
    let cancelled = false
    fetchBookCopies(book.id)
      .then((all) => { if (!cancelled) setCopies(all) })
      .catch(() => { /* best-effort — the book's own aggregate status still shows either way */ })
    return () => { cancelled = true }
  }, [book?.id])

  const isMissing = book?.status === 'missing' || book?.status === 'misplaced'
  const missingCopies = copies.filter((c) => ['missing', 'lost', 'damaged', 'misplaced'].includes(c.status))
  const [resolvingCopyId, setResolvingCopyId] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState('')

  async function handleMarkFound(copyId: string) {
    setResolvingCopyId(copyId)
    setResolveError('')
    try {
      await markCopyFound(copyId)
      setCopies((prev) => prev.map((c) => (c.id === copyId ? { ...c, status: 'for_reshelving' } : c)))
      refetch()
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Could not mark this copy as found.')
    } finally {
      setResolvingCopyId(null)
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
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
  const pillStatus = pillStatusFor(book)

  // ── Handlers ──

  async function handleEditSubmit(data: BookFormData) {
    if (!book) return
    try {
      await updateBook(book.id, bookFormDataToPayload(data, { category: book.category, status: book.status }))
      if (data.cover_image_file) {
        await uploadBookCover(book.id, data.cover_image_file)
      }
      setEditOpen(false)
      refetch()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save changes to this book.')
    }
  }

  // Navigates away only once the archive succeeds. Note: handleDelete below
  // doesn't delete anything yet; it only goes back to the catalog.
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

  // A pill only for statuses this book's copies actually have.
  const copyStatusCounts = COPY_STATUSES
    .map((status) => ({ status, count: copies.filter((c) => c.status === status).length }))
    .filter((s) => s.count > 0)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">

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

      {editError && (
        <div
          className="mb-6 px-4 py-3 rounded-(--radius) border border-danger bg-danger-bg text-danger flex items-center justify-between gap-3"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          {editError}
          <button type="button" onClick={() => setEditError('')} className="font-semibold hover:underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {isMissing && missingCopies.length > 0 && (
        <div
          className="mb-6 rounded-(--radius) border border-[#DDD6FE] bg-[#EDE9FE] p-4"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          <p className="text-[#6D28D9] font-semibold mb-3" style={{ fontSize: 'var(--text-sm-body)' }}>
            {missingCopies.length} {missingCopies.length === 1 ? 'copy' : 'copies'} reported missing or misplaced
          </p>
          <div className="flex flex-col gap-2">
            {missingCopies.map((copy) => (
              <div
                key={copy.id}
                className="flex items-center justify-between gap-3 bg-white rounded-sm px-3 py-2 border border-[#DDD6FE]"
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                  {copy.accession_number}
                  <span className="text-ink-400 ml-2 capitalize" style={{ fontFamily: 'var(--font-body)' }}>
                    {copy.status}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleMarkFound(copy.id)}
                  disabled={resolvingCopyId === copy.id}
                  className="px-3 py-1.5 rounded-sm bg-[#6D28D9] text-white font-semibold hover:bg-[#5B21B6] transition-colors disabled:opacity-50 shrink-0"
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {resolvingCopyId === copy.id ? 'Marking…' : 'Mark Found'}
                </button>
              </div>
            ))}
          </div>
          {resolveError && (
            <p className="text-danger mt-2" style={{ fontSize: 'var(--text-xs)' }}>{resolveError}</p>
          )}
          <p className="text-[#6D28D9]/70 mt-3" style={{ fontSize: 'var(--text-xs)' }}>
            Marking a copy found sends it to the Reshelving Queue — scan it in Borrow &amp; Return once it&apos;s back on the shelf to make it available again.
          </p>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="flex flex-col sm:flex-row gap-5 sm:gap-7 mb-8">

        {/* Cover */}
        <div
          className="shrink-0 rounded-(--radius) overflow-hidden shadow-(--shadow) self-start relative"
          style={{
            width: 140,
            height: 198,
            background: coverColor,
            minWidth: 140,
          }}
        >
          <BookCover
            src={book.cover_url}
            alt={`Cover of ${book.title}`}
            className="w-full h-full object-cover"
            loading="eager"
            fallback={(
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
          />
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
              {book.subtitle && (
                <p
                  className="text-ink-700 mt-1"
                  style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
                >
                  {book.subtitle}
                </p>
              )}
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

            {/* Edit / Remove */}
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
                <GraduationCap size={10} />
                {programLabel(book.category)}
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
            {copyStatusCounts.map(({ status, count }) => {
              const cfg = copyStatusConfig(status)
              return (
                <span
                  key={status}
                  className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold', cfg.bg, cfg.text)}
                  style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
                >
                  <Copy size={11} />
                  {count} {cfg.label}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Two-column details: everything from the book form. Patrons only
          see the bibliographic part. Columns stretch to the same height. ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Bibliographic */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5 lg:h-full">
          <SectionHeading>Bibliographic Info</SectionHeading>
          {book.alternate_title && (
            <MetaRow icon={<Type size={14} />} label="Alternate title" value={book.alternate_title} />
          )}
          {book.edition && (
            <MetaRow icon={<BookMarked size={14} />} label="Edition" value={book.edition} />
          )}
          {book.series_title && (
            <MetaRow
              icon={<Library size={14} />}
              label="Series"
              value={book.series_volume ? `${book.series_title} ; ${book.series_volume}` : book.series_title}
            />
          )}
          {book.publisher && (
            <MetaRow icon={<Building2 size={14} />} label="Publisher" value={book.publisher} />
          )}
          {book.place_of_publication && (
            <MetaRow icon={<Globe size={14} />} label="Published in" value={book.place_of_publication} />
          )}
          {book.published_year && (
            <MetaRow icon={<Calendar size={14} />} label="Year" value={book.published_year} />
          )}
          {physicalDescription(book) && (
            <MetaRow icon={<Ruler size={14} />} label="Physical desc." value={physicalDescription(book)} />
          )}
          {book.isbn && (
            <MetaRow
              icon={<Hash size={14} />}
              label="ISBN"
              value={<span style={{ fontFamily: 'var(--font-mono)' }}>{book.isbn}</span>}
            />
          )}
          {book.lccn && (
            <MetaRow
              icon={<Hash size={14} />}
              label="LCCN"
              value={<span style={{ fontFamily: 'var(--font-mono)' }}>{book.lccn}</span>}
            />
          )}
          {book.issn && (
            <MetaRow
              icon={<Hash size={14} />}
              label="ISSN"
              value={<span style={{ fontFamily: 'var(--font-mono)' }}>{book.issn}</span>}
            />
          )}
          {book.category && (
            <MetaRow icon={<GraduationCap size={14} />} label="Program" value={programLabel(book.category)} />
          )}
          {book.subject && (
            <MetaRow icon={<Landmark size={14} />} label="College" value={book.subject} />
          )}
          {book.keywords && book.keywords.length > 0 && (
            <MetaRow icon={<Tags size={14} />} label="Keywords" value={book.keywords.join(', ')} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Location & copies */}
          <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
            <SectionHeading>Location & Copies</SectionHeading>
            {book.accession_no && (
              <MetaRow
                icon={<Barcode size={14} />}
                label="Accession No."
                value={<span style={{ fontFamily: 'var(--font-mono)' }}>{book.accession_no}</span>}
              />
            )}
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
                    <span className="font-bold">{book.available_copies ?? 0}</span>
                    {' / '}
                    {book.total_copies} available
                  </span>
                }
              />
            )}
            {book.collection_type && (
              <MetaRow icon={<Layers size={14} />} label="Collection" value={book.collection_type} />
            )}
          </div>

          {/* Acquisition (librarians only) */}
          <div className="bg-white rounded-(--radius) border border-ink-200 p-5 lg:flex-1">
            <SectionHeading>Acquisition (librarian only)</SectionHeading>
            {book.date_acquired && (
              <MetaRow icon={<Calendar size={14} />} label="Date acquired" value={formatLongDate(book.date_acquired)} />
            )}
            {book.purchase_price != null && (
              <MetaRow
                icon={<Banknote size={14} />}
                label="Purchase price"
                value={`₱${book.purchase_price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
            )}
            {book.vendor && (
              <MetaRow icon={<Store size={14} />} label="Vendor" value={book.vendor} />
            )}
            {book.funding_source && (
              <MetaRow icon={<HandCoins size={14} />} label="Funding" value={FUNDING_LABEL[book.funding_source]} />
            )}
            {book.circulation_type && (
              <MetaRow icon={<Layers size={14} />} label="Circulation" value={book.circulation_type} />
            )}
            {!book.date_acquired && book.purchase_price == null && !book.vendor && !book.funding_source && !book.circulation_type && (
              <p className="text-ink-400 pb-2" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                No acquisition details recorded yet — add them with Edit.
              </p>
            )}
            <MetaRow icon={<CalendarPlus size={14} />} label="Added to catalog" value={formatLongDate(book.created_at)} />
            <MetaRow icon={<RefreshCw size={14} />} label="Last updated" value={formatLongDate(book.updated_at)} />
          </div>
        </div>
      </div>

      {/* Staff notes — librarian-only */}
      {book.notes && (
        <div className="bg-white rounded-(--radius) border border-ink-200 p-5 mb-6">
          <SectionHeading>
            <span className="inline-flex items-center gap-1.5"><StickyNote size={12} /> Staff notes (librarian only)</span>
          </SectionHeading>
          <p
            className="text-ink-700 leading-relaxed whitespace-pre-line"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}
          >
            {book.notes}
          </p>
        </div>
      )}

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

      {/* ── Copy Management ── */}
      <div className="bg-white rounded-(--radius) border border-ink-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <SectionHeading>Copy Management</SectionHeading>
        </div>

        <CopyManagementTable copies={copies} shelfLocation={book.shelf_location} />
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