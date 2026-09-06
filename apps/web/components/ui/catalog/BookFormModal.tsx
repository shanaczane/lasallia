// apps/web/components/ui/catalog/BookFormModal.tsx
// Sprint 5.2.2 — Add New Book form
// Sprint 5.2.3 — Edit / Update Book form (pre-populated)
// Tabbed layout — mirrors how the LRC's own cataloging tool (Destiny) splits
// a title into Brief Title / Series-Notes / Subjects / Added Entries tabs,
// scaled down to what this app tracks. Split into 6 focused tabs (rather than
// fewer, longer ones) specifically so no single tab's content needs its own
// scroll on a typical screen — the modal body scrolls only if it truly has to.

'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X, Upload, ImageIcon, AlertCircle, BookOpen, Hash, MapPin, Wallet, Tags, Plus, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { COLLEGES } from '@/lib/colleges'
import type { Book, BookFormat, BookStatus, FundingSource } from '@lasallia/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookFormData = {
  title: string
  subtitle: string
  alternateTitle: string
  authors: string[]          // built up one at a time via the "+" picker, joined with ", " for Book.author
  isbn: string
  lccn: string
  issn: string
  edition: string
  seriesTitle: string
  seriesVolume: string
  publisher: string
  placeOfPublication: string
  published_year: string
  physicalExtent: string
  physicalIllustrations: string
  physicalDimensions: string
  accession_no: string
  call_number: string
  floor: string
  aisle: string
  total_copies: string
  category: string
  subject: string
  format: BookFormat | ''
  keywords: string           // comma-separated; caller splits into Book.keywords
  abstract: string
  notes: string
  status: BookStatus | ''
  purchase_price: string
  date_acquired: string
  circulation_type: string
  vendor: string
  funding_source: FundingSource | ''
  cover_image_file?: File | null
  cover_url?: string
}

type BookFormModalProps = {
  mode: 'add' | 'edit'
  book?: Book            // pre-populated when editing
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: BookFormData) => void
}

const EMPTY_FORM: BookFormData = {
  title: '',
  subtitle: '',
  alternateTitle: '',
  authors: [],
  isbn: '',
  lccn: '',
  issn: '',
  edition: '',
  seriesTitle: '',
  seriesVolume: '',
  publisher: '',
  placeOfPublication: '',
  published_year: '',
  physicalExtent: '',
  physicalIllustrations: '',
  physicalDimensions: '',
  accession_no: '',
  call_number: '',
  floor: '',
  aisle: '',
  total_copies: '1',
  category: '',
  subject: '',
  format: '',
  keywords: '',
  abstract: '',
  notes: '',
  status: '',
  purchase_price: '',
  date_acquired: '',
  circulation_type: '',
  vendor: '',
  funding_source: '',
  cover_image_file: null,
  cover_url: '',
}

const FORMAT_OPTIONS: Array<{ value: BookFormat; label: string }> = [
  { value: 'print',     label: 'Print' },
  { value: 'digital',   label: 'Digital' },
  { value: 'reference', label: 'Reference' },
]

const STATUS_OPTIONS: Array<{ value: BookStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'borrowed',  label: 'Borrowed' },
  { value: 'reserved',  label: 'Reserved' },
  { value: 'misplaced', label: 'Missing' },
]

const FUNDING_SOURCE_OPTIONS: Array<{ value: FundingSource; label: string }> = [
  { value: 'purchased', label: 'Purchased' },
  { value: 'donated',   label: 'Donated' },
  { value: 'grant',     label: 'Grant-Funded' },
]

const FLOOR_OPTIONS = ['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4']

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabKey = 'titleAuthors' | 'publication' | 'identifiers' | 'physicalLocation' | 'acquisition' | 'subjects'

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'titleAuthors',    label: 'Title & Authors', icon: <BookOpen size={14} /> },
  { key: 'publication',     label: 'Publication',     icon: <Building2 size={14} /> },
  { key: 'identifiers',     label: 'Identifiers',     icon: <Hash size={14} /> },
  { key: 'physicalLocation', label: 'Physical & Location', icon: <MapPin size={14} /> },
  { key: 'acquisition',     label: 'Acquisition',     icon: <Wallet size={14} /> },
  { key: 'subjects',        label: 'Subjects & Notes', icon: <Tags size={14} /> },
]

// Which tab each validated field lives on — used to badge a tab with an
// error dot, and to jump the user straight to the first tab that failed.
const TAB_FOR_FIELD: Partial<Record<keyof BookFormData, TabKey>> = {
  title: 'titleAuthors',
  authors: 'titleAuthors',
  format: 'titleAuthors',
  published_year: 'publication',
  isbn: 'identifiers',
  accession_no: 'identifiers',
  call_number: 'physicalLocation',
  floor: 'physicalLocation',
  aisle: 'physicalLocation',
  total_copies: 'physicalLocation',
  purchase_price: 'acquisition',
}

// ─── Field helpers ────────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  hint?: string
  className?: string
}

function Field({ label, required, error, children, hint, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        className="text-ink-700 font-medium"
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
          {hint}
        </p>
      )}
      {error && (
        <p className="flex items-center gap-1 text-danger" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  )
}

const inputClass = cn(
  'w-full px-3.5 py-2.5 rounded-sm border bg-white text-ink-900',
  'placeholder:text-ink-300 focus:outline-none transition-colors',
  'border-ink-200 focus:border-green-700 hover:border-ink-300'
)

const selectArrowStyle: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '2rem',
}

// Groups related fields under a labeled, icon-badged block within a tab.
function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2.5">
        {icon && (
          <span className="flex items-center justify-center rounded-sm bg-green-50 text-green-700 shrink-0" style={{ width: 26, height: 26 }}>
            {icon}
          </span>
        )}
        <div>
          <p
            className="text-ink-900 font-semibold"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            {title}
          </p>
          {description && (
            <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

// ─── Author picker ────────────────────────────────────────────────────────────
// One text field + a "+" button, building up a chip list — covers primary
// authors, co-authors, editors, and illustrators alike (no separate role
// picker; add each contributor as its own chip).

function AuthorPicker({
  authors,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  hasError,
}: {
  authors: string[]
  draft: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
  hasError?: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onAdd() }
          }}
          placeholder="e.g. Robert C. Martin"
          className={cn(inputClass, hasError && 'border-danger focus:border-danger')}
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim()}
          aria-label="Add author"
          title="Add author"
          className="flex items-center justify-center shrink-0 px-3.5 rounded-sm bg-green-700 text-white hover:bg-green-800 active:bg-green-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={18} />
        </button>
      </div>

      {authors.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {authors.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-ink-100 text-ink-700"
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            >
              {name}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${name}`}
                className="flex items-center justify-center w-4 h-4 rounded-full text-ink-400 hover:bg-ink-200 hover:text-ink-700 transition-colors"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
          Type a name and press <span className="font-medium text-ink-500">+</span> (or Enter) to add it — add every author, co-author, editor, or illustrator this way.
        </p>
      )}
    </div>
  )
}

// ─── Cover image upload ───────────────────────────────────────────────────────

function CoverUpload({
  value,
  previewUrl,
  onChange,
}: {
  value?: File | null
  previewUrl?: string
  onChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!value) { setLocalPreview(null); return }
    const url = URL.createObjectURL(value)
    setLocalPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const displaySrc = localPreview ?? previewUrl ?? null

  return (
    <div className="flex items-start gap-3">
      {/* Preview */}
      <div
        className="shrink-0 rounded-sm border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center"
        style={{ width: 56, height: 78 }}
      >
        {displaySrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displaySrc} alt="Cover preview" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={20} className="text-ink-300" />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50 transition-colors"
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          <Upload size={13} />
          {displaySrc ? 'Replace image' : 'Upload cover'}
        </button>
        {displaySrc && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-danger hover:text-danger-dark transition-colors text-left"
            style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
          >
            Remove image
          </button>
        )}
        <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
          JPG or PNG, max 5 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  )
}

// ─── Validation ───────────────────────────────────────────────────────────────

type FormErrors = Partial<Record<keyof BookFormData, string>>

function validate(data: BookFormData): FormErrors {
  const errors: FormErrors = {}
  if (!data.title.trim())       errors.title       = 'Title is required'
  if (data.authors.length === 0) errors.authors    = 'At least one author is required'
  if (!data.call_number.trim()) errors.call_number = 'Call number is required'
  if (!data.accession_no.trim()) errors.accession_no = 'Accession number is required'
  if (!data.floor.trim())       errors.floor       = 'Floor is required'
  if (!data.aisle.trim())       errors.aisle       = 'Aisle is required'
  if (!data.format)             errors.format      = 'Format is required'

  const year = parseInt(data.published_year, 10)
  if (data.published_year && (isNaN(year) || year < 1000 || year > new Date().getFullYear() + 1)) {
    errors.published_year = 'Enter a valid 4-digit year'
  }

  const copies = parseInt(data.total_copies, 10)
  if (!data.total_copies || isNaN(copies) || copies < 1) {
    errors.total_copies = 'Enter at least 1 copy'
  }

  if (data.isbn && !/^[\d\-X]{10,17}$/.test(data.isbn.replace(/\s/g, ''))) {
    errors.isbn = 'Enter a valid ISBN (10 or 13 digits)'
  }

  if (data.purchase_price && (isNaN(Number(data.purchase_price)) || Number(data.purchase_price) < 0)) {
    errors.purchase_price = 'Enter a valid amount'
  }

  return errors
}

function firstErrorTab(errors: FormErrors): TabKey | null {
  for (const tab of TABS) {
    const onThisTab = Object.keys(errors).some((key) => TAB_FOR_FIELD[key as keyof BookFormData] === tab.key)
    if (onThisTab) return tab.key
  }
  return null
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BookFormModal({ mode, book, isOpen, onClose, onSubmit }: BookFormModalProps) {
  const [form, setForm] = useState<BookFormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [tab, setTab] = useState<TabKey>('titleAuthors')
  const [authorDraft, setAuthorDraft] = useState('')

  // Pre-populate when editing
  useEffect(() => {
    if (mode === 'edit' && book) {
      setForm({
        title:                  book.title,
        subtitle:               book.subtitle ?? '',
        alternateTitle:         book.alternate_title ?? '',
        authors:                book.author ? book.author.split(',').map((a) => a.trim()).filter(Boolean) : [],
        isbn:                   book.isbn ?? '',
        lccn:                   book.lccn ?? '',
        issn:                   book.issn ?? '',
        edition:                book.edition ?? '',
        seriesTitle:            book.series_title ?? '',
        seriesVolume:           book.series_volume ?? '',
        publisher:              book.publisher ?? '',
        placeOfPublication:     book.place_of_publication ?? '',
        published_year:         book.published_year?.toString() ?? '',
        physicalExtent:         book.physical_extent ?? '',
        physicalIllustrations:  book.physical_illustrations ?? '',
        physicalDimensions:     book.physical_dimensions ?? '',
        accession_no:           book.accession_no ?? '',
        call_number:            book.call_number,
        floor:                  book.floor ?? '',
        aisle:                  book.aisle ?? '',
        total_copies:           book.total_copies?.toString() ?? '1',
        category:               book.category,
        subject:                book.subject ?? '',
        format:                 book.format ?? '',
        keywords:               book.keywords?.join(', ') ?? '',
        abstract:               book.abstract ?? '',
        notes:                  book.notes ?? '',
        status:                 book.status ?? '',
        purchase_price:         book.purchase_price?.toString() ?? '',
        date_acquired:          book.date_acquired ? book.date_acquired.slice(0, 10) : '',
        circulation_type:       book.circulation_type ?? '',
        vendor:                 book.vendor ?? '',
        funding_source:         book.funding_source ?? '',
        cover_image_file:       null,
        cover_url:              book.cover_url ?? '',
      })
    } else if (mode === 'add') {
      setForm(EMPTY_FORM)
    }
    setErrors({})
    setSubmitted(false)
    setTab('titleAuthors')
    setAuthorDraft('')
  }, [mode, book, isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  function set<K extends keyof BookFormData>(key: K, value: BookFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    if (submitted) {
      setErrors((e) => {
        const next = { ...e }
        delete next[key]
        return next
      })
    }
  }

  function addAuthor() {
    const name = authorDraft.trim()
    if (!name) return
    set('authors', [...form.authors, name])
    setAuthorDraft('')
  }

  function removeAuthor(index: number) {
    set('authors', form.authors.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    setSubmitted(true)
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      const badTab = firstErrorTab(errs)
      if (badTab) setTab(badTab)
      return
    }
    onSubmit(form)
  }

  if (!isOpen) return null

  const isEdit = mode === 'edit'
  const title  = isEdit ? 'Edit Book' : 'Add New Book'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-4xl lg:max-w-5xl h-[94dvh] sm:h-[90dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-ink-100 shrink-0">
          <div>
            <p
              className="text-ink-900 font-semibold"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}
            >
              {title}
            </p>
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              Fields marked <span className="text-danger font-medium">*</span> are required — everything else can be added or fixed later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-ink-100 text-ink-400 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-ink-200 px-8 shrink-0 overflow-x-auto">
          {TABS.map((t) => {
            const tabHasError = submitted && Object.keys(errors).some((key) => TAB_FOR_FIELD[key as keyof BookFormData] === t.key)
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-3 font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
                  tab === t.key ? 'border-green-700 text-green-700' : 'border-transparent text-ink-500 hover:text-ink-900'
                )}
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
              >
                {t.icon}
                {t.label}
                {tabHasError && <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-label="This tab has an error" />}
              </button>
            )
          })}
        </div>

        {/* Body — the ONLY scrollable region; min-h-0 lets this flex child
            actually shrink to fit inside the fixed-height card above instead
            of forcing the whole modal to overflow the viewport. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 flex flex-col gap-7">

          {tab === 'titleAuthors' && (
            <>
              <Field label="Cover Image">
                <CoverUpload
                  value={form.cover_image_file}
                  previewUrl={form.cover_url}
                  onChange={(f) => set('cover_image_file', f)}
                />
              </Field>

              <FormSection
                title="Title & Authors"
                description="The core details that identify this title"
                icon={<BookOpen size={14} />}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Title" required error={errors.title}>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                      placeholder="e.g. Clean Code"
                      className={cn(inputClass, errors.title && 'border-danger focus:border-danger')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Subtitle">
                    <input
                      type="text"
                      value={form.subtitle}
                      onChange={(e) => set('subtitle', e.target.value)}
                      placeholder="e.g. A Handbook of Agile Software Craftsmanship"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                </div>

                <Field label="Alternate Title" hint="An alternate, translated, or cover title, if any">
                  <input
                    type="text"
                    value={form.alternateTitle}
                    onChange={(e) => set('alternateTitle', e.target.value)}
                    placeholder="e.g. original or translated title"
                    className={inputClass}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  />
                </Field>

                <Field label="Author(s)" required error={errors.authors}>
                  <AuthorPicker
                    authors={form.authors}
                    draft={authorDraft}
                    onDraftChange={setAuthorDraft}
                    onAdd={addAuthor}
                    onRemove={removeAuthor}
                    hasError={!!errors.authors}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Edition" hint="e.g. 3rd Edition">
                    <input
                      type="text"
                      value={form.edition}
                      onChange={(e) => set('edition', e.target.value)}
                      placeholder="e.g. 3rd Edition"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Format" required error={errors.format}>
                    <select
                      value={form.format}
                      onChange={(e) => set('format', e.target.value as BookFormat)}
                      className={cn(inputClass, 'appearance-none cursor-pointer', errors.format && 'border-danger focus:border-danger')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)', ...selectArrowStyle }}
                    >
                      <option value="">Select format…</option>
                      {FORMAT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </FormSection>
            </>
          )}

          {tab === 'publication' && (
            <>
              <FormSection
                title="Publication Information"
                description="Who published this title, where, and when"
                icon={<Building2 size={14} />}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Publisher">
                    <input
                      type="text"
                      value={form.publisher}
                      onChange={(e) => set('publisher', e.target.value)}
                      placeholder="e.g. Prentice Hall"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Place of Publication">
                    <input
                      type="text"
                      value={form.placeOfPublication}
                      onChange={(e) => set('placeOfPublication', e.target.value)}
                      placeholder="e.g. Quezon City"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                </div>
                <Field label="Year Published" error={errors.published_year} className="sm:max-w-50">
                  <input
                    type="number"
                    value={form.published_year}
                    onChange={(e) => set('published_year', e.target.value)}
                    placeholder={String(new Date().getFullYear())}
                    min={1000}
                    max={new Date().getFullYear() + 1}
                    className={cn(inputClass, errors.published_year && 'border-danger focus:border-danger')}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  />
                </Field>
              </FormSection>

              <FormSection
                title="Series Information"
                description="Only applies if this title is part of a series"
                icon={<BookOpen size={14} />}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Field label="Series Title" className="sm:col-span-2">
                    <input
                      type="text"
                      value={form.seriesTitle}
                      onChange={(e) => set('seriesTitle', e.target.value)}
                      placeholder="e.g. The Ring of Solomon Chronicles"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Volume #">
                    <input
                      type="text"
                      value={form.seriesVolume}
                      onChange={(e) => set('seriesVolume', e.target.value)}
                      placeholder="e.g. 2"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                </div>
              </FormSection>
            </>
          )}

          {tab === 'identifiers' && (
            <FormSection
              title="Standard Numbers"
              description="Numbers used to look this book up elsewhere"
              icon={<Hash size={14} />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Field label="ISBN" error={errors.isbn}>
                  <input
                    type="text"
                    value={form.isbn}
                    onChange={(e) => set('isbn', e.target.value)}
                    placeholder="978-0-13-235088-4"
                    className={cn(inputClass, errors.isbn && 'border-danger focus:border-danger')}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                  />
                </Field>
                <Field label="LCCN" hint="Library of Congress Control Number">
                  <input
                    type="text"
                    value={form.lccn}
                    onChange={(e) => set('lccn', e.target.value)}
                    placeholder="e.g. 2003064470"
                    className={inputClass}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                  />
                </Field>
                <Field label="ISSN" hint="For serials/journals only">
                  <input
                    type="text"
                    value={form.issn}
                    onChange={(e) => set('issn', e.target.value)}
                    placeholder="e.g. 2049-3630"
                    className={inputClass}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                  />
                </Field>
              </div>
              <Field label="Accession No." required error={errors.accession_no} hint="LRC barcode / copy ID" className="sm:max-w-50">
                <input
                  type="text"
                  value={form.accession_no}
                  onChange={(e) => set('accession_no', e.target.value)}
                  placeholder="e.g. T44882"
                  className={cn(inputClass, errors.accession_no && 'border-danger focus:border-danger')}
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                />
              </Field>
            </FormSection>
          )}

          {tab === 'physicalLocation' && (
            <>
              <FormSection
                title="Physical Description"
                description="What the physical item looks like"
                icon={<BookOpen size={14} />}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Field label="Extent" hint="e.g. xii, 250 pages">
                    <input
                      type="text"
                      value={form.physicalExtent}
                      onChange={(e) => set('physicalExtent', e.target.value)}
                      placeholder="e.g. xii, 250 pages"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Illustrations" hint="e.g. illustrations, maps">
                    <input
                      type="text"
                      value={form.physicalIllustrations}
                      onChange={(e) => set('physicalIllustrations', e.target.value)}
                      placeholder="e.g. illustrations"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Dimensions" hint="e.g. 24 cm">
                    <input
                      type="text"
                      value={form.physicalDimensions}
                      onChange={(e) => set('physicalDimensions', e.target.value)}
                      placeholder="e.g. 24 cm"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                title="Classification & Location"
                description="Where this book lives on the shelf, and who it's for"
                icon={<MapPin size={14} />}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Field
                    label="Dewey Decimal Call No."
                    required
                    error={errors.call_number}
                    hint="e.g. 005.133 M377c"
                  >
                    <input
                      type="text"
                      value={form.call_number}
                      onChange={(e) => set('call_number', e.target.value)}
                      placeholder="005.133 M377c"
                      className={cn(inputClass, errors.call_number && 'border-danger focus:border-danger')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                    />
                  </Field>
                  <Field label="Program">
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => set('category', e.target.value)}
                      placeholder="e.g. BS Computer Science"
                      className={inputClass}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="College">
                    <select
                      value={form.subject}
                      onChange={(e) => set('subject', e.target.value)}
                      className={cn(inputClass, 'appearance-none cursor-pointer')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)', ...selectArrowStyle }}
                    >
                      <option value="">Select college…</option>
                      {COLLEGES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Field label="Floor" required error={errors.floor}>
                    <select
                      value={form.floor}
                      onChange={(e) => set('floor', e.target.value)}
                      className={cn(inputClass, 'appearance-none cursor-pointer', errors.floor && 'border-danger focus:border-danger')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)', ...selectArrowStyle }}
                    >
                      <option value="">Select floor…</option>
                      {FLOOR_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Aisle" required error={errors.aisle}>
                    <input
                      type="text"
                      value={form.aisle}
                      onChange={(e) => set('aisle', e.target.value)}
                      placeholder="e.g. Aisle 3"
                      className={cn(inputClass, errors.aisle && 'border-danger focus:border-danger')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                  <Field label="Total Copies" required error={errors.total_copies}>
                    <input
                      type="number"
                      value={form.total_copies}
                      onChange={(e) => set('total_copies', e.target.value)}
                      min={1}
                      className={cn(inputClass, errors.total_copies && 'border-danger focus:border-danger')}
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    />
                  </Field>
                </div>
              </FormSection>
            </>
          )}

          {tab === 'acquisition' && (
            <FormSection
              title="Acquisition & Copy Details"
              description="Librarian-only inventory record — never shown to patrons"
              icon={<Wallet size={14} />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => set('status', e.target.value as BookStatus)}
                    className={cn(inputClass, 'appearance-none cursor-pointer')}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)', ...selectArrowStyle }}
                  >
                    <option value="">Select status…</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Purchase Price" error={errors.purchase_price} hint="PHP">
                  <input
                    type="number"
                    value={form.purchase_price}
                    onChange={(e) => set('purchase_price', e.target.value)}
                    placeholder="e.g. 1500.00"
                    min={0}
                    step="0.01"
                    className={cn(inputClass, errors.purchase_price && 'border-danger focus:border-danger')}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  />
                </Field>
                <Field label="Date Acquired">
                  <input
                    type="date"
                    value={form.date_acquired}
                    onChange={(e) => set('date_acquired', e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className={inputClass}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Field label="Circulation Type" hint="e.g. General Collection - Law, Reserve" className="sm:col-span-2">
                  <input
                    type="text"
                    value={form.circulation_type}
                    onChange={(e) => set('circulation_type', e.target.value)}
                    placeholder="e.g. General Collection - Law"
                    className={inputClass}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  />
                </Field>
                <Field label="Funding Source">
                  <select
                    value={form.funding_source}
                    onChange={(e) => set('funding_source', e.target.value as FundingSource)}
                    className={cn(inputClass, 'appearance-none cursor-pointer')}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)', ...selectArrowStyle }}
                  >
                    <option value="">Select source…</option>
                    {FUNDING_SOURCE_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Vendor" className="sm:max-w-70">
                <input
                  type="text"
                  value={form.vendor}
                  onChange={(e) => set('vendor', e.target.value)}
                  placeholder="e.g. Forefront"
                  className={inputClass}
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                />
              </Field>
            </FormSection>
          )}

          {tab === 'subjects' && (
            <FormSection
              title="Subjects & Description"
              description="Helps patrons find this book through search"
              icon={<Tags size={14} />}
            >
              <Field label="Keywords" hint="Comma-separated — helps search and recommendations">
                <input
                  type="text"
                  value={form.keywords}
                  onChange={(e) => set('keywords', e.target.value)}
                  placeholder="e.g. algorithms, data structures, sorting"
                  className={inputClass}
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                />
              </Field>
              <Field label="Abstract / Description" hint="Shown to patrons on the book's page">
                <textarea
                  value={form.abstract}
                  onChange={(e) => set('abstract', e.target.value)}
                  rows={3}
                  placeholder="Brief description of the book…"
                  className={cn(inputClass, 'resize-none')}
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                />
              </Field>
              <Field label="Internal Notes" hint="Staff-only — never shown to patrons">
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  placeholder="e.g. No RFID tag on this copy yet"
                  className={cn(inputClass, 'resize-none')}
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                />
              </Field>
            </FormSection>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-ink-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            {isEdit ? 'Save Changes' : 'Add Book'}
          </button>
        </div>
      </div>
    </div>
  )
}
