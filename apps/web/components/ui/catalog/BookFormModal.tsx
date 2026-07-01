// apps/web/components/ui/catalog/BookFormModal.tsx
// Sprint 5.2.2 — Add New Book form
// Sprint 5.2.3 — Edit / Update Book form (pre-populated)

'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Upload, ImageIcon, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Book, BookFormat } from '@lasallia/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookFormData = {
  title: string
  author: string
  isbn: string
  publisher: string
  published_year: string
  call_number: string
  floor: string
  aisle: string
  total_copies: string
  category: string
  subject: string
  format: BookFormat | ''
  abstract: string
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
  author: '',
  isbn: '',
  publisher: '',
  published_year: '',
  call_number: '',
  floor: '',
  aisle: '',
  total_copies: '1',
  category: '',
  subject: '',
  format: '',
  abstract: '',
  cover_image_file: null,
  cover_url: '',
}

const FORMAT_OPTIONS: Array<{ value: BookFormat; label: string }> = [
  { value: 'print',     label: 'Print' },
  { value: 'digital',   label: 'Digital' },
  { value: 'reference', label: 'Reference' },
]

const FLOOR_OPTIONS = ['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4']

// ─── Field helpers ────────────────────────────────────────────────────────────

type FieldProps = {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  hint?: string
}

function Field({ label, required, error, children, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
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
  'w-full px-3 py-2 rounded-sm border bg-white text-ink-900',
  'placeholder:text-ink-300 focus:outline-none transition-colors',
  'border-ink-200 focus:border-green-700 hover:border-ink-300'
)

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
  if (!data.author.trim())      errors.author      = 'Author is required'
  if (!data.call_number.trim()) errors.call_number = 'Call number is required'
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

  return errors
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BookFormModal({ mode, book, isOpen, onClose, onSubmit }: BookFormModalProps) {
  const [form, setForm] = useState<BookFormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  // Pre-populate when editing
  useEffect(() => {
    if (mode === 'edit' && book) {
      setForm({
        title:           book.title,
        author:          book.author,
        isbn:            book.isbn ?? '',
        publisher:       book.publisher ?? '',
        published_year:  book.published_year?.toString() ?? '',
        call_number:     book.call_number,
        floor:           book.floor ?? '',
        aisle:           book.aisle ?? '',
        total_copies:    book.total_copies?.toString() ?? '1',
        category:        book.category,
        subject:         book.subject ?? '',
        format:          book.format ?? '',
        abstract:        book.abstract ?? '',
        cover_image_file: null,
        cover_url:       book.cover_url ?? '',
      })
    } else if (mode === 'add') {
      setForm(EMPTY_FORM)
    }
    setErrors({})
    setSubmitted(false)
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

  function handleSubmit() {
    setSubmitted(true)
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
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
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 shrink-0">
          <p
            className="text-ink-900 font-semibold"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}
          >
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 text-ink-400 transition-colors"
            aria-label="Close modal"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Cover image */}
          <Field label="Cover Image">
            <CoverUpload
              value={form.cover_image_file}
              previewUrl={form.cover_url}
              onChange={(f) => set('cover_image_file', f)}
            />
          </Field>

          {/* Title + Author */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Field label="Author(s)" required error={errors.author}>
              <input
                type="text"
                value={form.author}
                onChange={(e) => set('author', e.target.value)}
                placeholder="e.g. Robert C. Martin"
                className={cn(inputClass, errors.author && 'border-danger focus:border-danger')}
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              />
            </Field>
          </div>

          {/* ISBN + Publisher + Year */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <Field label="Year Published" error={errors.published_year}>
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
          </div>

          {/* Call number + Floor + Aisle */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

            <Field label="Floor" required error={errors.floor}>
              <select
                value={form.floor}
                onChange={(e) => set('floor', e.target.value)}
                className={cn(
                  inputClass,
                  'appearance-none cursor-pointer',
                  errors.floor && 'border-danger focus:border-danger'
                )}
                style={{
                  fontSize: 'var(--text-sm-body)',
                  fontFamily: 'var(--font-body)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  paddingRight: '2rem',
                }}
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
          </div>

          {/* Total copies + Format + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

            <Field label="Format" required error={errors.format}>
              <select
                value={form.format}
                onChange={(e) => set('format', e.target.value as BookFormat)}
                className={cn(
                  inputClass,
                  'appearance-none cursor-pointer',
                  errors.format && 'border-danger focus:border-danger'
                )}
                style={{
                  fontSize: 'var(--text-sm-body)',
                  fontFamily: 'var(--font-body)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  paddingRight: '2rem',
                }}
              >
                <option value="">Select format…</option>
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Category / Genre">
              <input
                type="text"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="e.g. Computer Science"
                className={inputClass}
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              />
            </Field>
          </div>

          {/* Subject */}
          <Field label="Subject Heading">
            <input
              type="text"
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="e.g. Software Engineering"
              className={inputClass}
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            />
          </Field>

          {/* Abstract */}
          <Field label="Abstract / Description">
            <textarea
              value={form.abstract}
              onChange={(e) => set('abstract', e.target.value)}
              rows={3}
              placeholder="Brief description of the book…"
              className={cn(inputClass, 'resize-none')}
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink-100 shrink-0">
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