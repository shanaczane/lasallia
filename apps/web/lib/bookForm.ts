// apps/web/lib/bookForm.ts
// Shared by the catalog list page and the book detail page — both submit
// BookFormModal's Add/Edit form and need the same flat-strings-to-BookWrite
// mapping (schemas.book.BookWrite on the API).

import type { Book } from '@lasallia/types'
import type { BookFormData } from '@/components/ui/catalog/BookFormModal'
import type { BookWritePayload } from '@/lib/books'

// BookFormModal hands back keywords as one comma-separated string (plain
// <input>, not a tag picker) — split it into the array Book.keywords wants.
export function parseKeywords(raw: string): string[] | undefined {
  const list = raw.split(',').map((k) => k.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

export function bookFormDataToPayload(
  data: BookFormData,
  fallback: { category?: string; status?: Book['status'] } = {}
): BookWritePayload {
  return {
    accession_no:           data.accession_no.trim() || undefined,
    title:                  data.title.trim(),
    subtitle:               data.subtitle.trim() || undefined,
    alternate_title:        data.alternateTitle.trim() || undefined,
    author:                 data.authors.join(', '),
    isbn:                   data.isbn.trim() || undefined,
    lccn:                   data.lccn.trim() || undefined,
    issn:                   data.issn.trim() || undefined,
    edition:                data.edition.trim() || undefined,
    series_title:           data.seriesTitle.trim() || undefined,
    series_volume:          data.seriesVolume.trim() || undefined,
    place_of_publication:   data.placeOfPublication.trim() || undefined,
    physical_extent:        data.physicalExtent.trim() || undefined,
    physical_illustrations: data.physicalIllustrations.trim() || undefined,
    physical_dimensions:    data.physicalDimensions.trim() || undefined,
    publisher:              data.publisher.trim() || undefined,
    published_year:         data.published_year ? parseInt(data.published_year, 10) : undefined,
    call_number:            data.call_number.trim(),
    floor:                  data.floor,
    aisle:                  data.aisle.trim(),
    shelf_location:         `${data.floor} · ${data.aisle.trim()}`,
    total_copies:           parseInt(data.total_copies, 10),
    available_copies:       parseInt(data.total_copies, 10),
    category:               data.category.trim() || fallback.category || 'Uncategorised',
    subject:                data.subject.trim() || undefined,
    format:                 data.format || undefined,
    keywords:               parseKeywords(data.keywords),
    abstract:               data.abstract.trim() || undefined,
    notes:                  data.notes.trim() || undefined,
    purchase_price:         data.purchase_price ? Number(data.purchase_price) : undefined,
    date_acquired:          data.date_acquired ? new Date(data.date_acquired).toISOString() : undefined,
    circulation_type:       data.circulation_type.trim() || undefined,
    vendor:                 data.vendor.trim() || undefined,
    funding_source:         data.funding_source || undefined,
    status:                 data.status || fallback.status || 'available',
    cover_url:              data.cover_url || undefined,
  }
}
