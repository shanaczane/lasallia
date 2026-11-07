// Book request rules for the forms, with the same messages as
// apps/api/core/book_requests.py, which has the final say. Only types are
// imported, so lib/bookRequestForm.test.ts runs on its own.

import type { BookRequestStatus } from "./bookRequests"

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_REQUEST_FILES = 5
export const MIN_REJECTION_REASON_LENGTH = 10
// Used until Library Settings load.
export const DEFAULT_MAX_COPIES = 10

export const REQUEST_STATUS_LABEL: Record<BookRequestStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
}

export const REQUEST_STATUS_BADGE: Record<BookRequestStatus, string> = {
  pending: "bg-warn-bg text-warn",
  under_review: "bg-gold-100 text-gold-600",
  approved: "bg-info-bg text-info",
  rejected: "bg-danger-bg text-danger",
  fulfilled: "bg-success-bg text-success",
  cancelled: "bg-ink-100 text-ink-500",
}

function isValidIsbn(typed: string): boolean {
  const isbn = typed.replace(/^\s*ISBN(-1[03])?\s*:?\s*/i, "").replace(/[\s-]/g, "").toUpperCase()
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const total = [...isbn].reduce((sum, c, i) => sum + (10 - i) * (c === "X" ? 10 : Number(c)), 0)
    return total % 11 === 0
  }
  if (/^\d{13}$/.test(isbn)) {
    const total = [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 === 0 ? 1 : 3), 0)
    return total % 10 === 0
  }
  return false
}

export type RequestFormFields = { title: string; author: string; isbn: string; copies: number; course: string }
export type RequestFormErrors = Partial<Record<keyof RequestFormFields, string>>

export function validateRequestForm(fields: RequestFormFields, maxCopies: number): RequestFormErrors {
  const errors: RequestFormErrors = {}
  if (!fields.title.trim()) errors.title = "Title is required"
  if (!fields.author.trim()) errors.author = "Author is required"
  if (!Number.isInteger(fields.copies) || fields.copies < 1 || fields.copies > maxCopies) {
    errors.copies = `Copies must be a whole number from 1 to ${maxCopies}`
  }
  if (!fields.course.trim()) errors.course = "Related course is required"
  if (fields.isbn.trim() && !isValidIsbn(fields.isbn)) {
    errors.isbn = "Enter a valid ISBN-10 or ISBN-13. Check the digits for a typo."
  }
  return errors
}

export function hasErrors(errors: RequestFormErrors): boolean {
  return Object.keys(errors).length > 0
}

export function tooManyFiles(attached: number, picked: number): string | null {
  return attached + picked > MAX_REQUEST_FILES ? `A request can have at most ${MAX_REQUEST_FILES} files` : null
}

export function rejectionReasonProblem(reason: string): string | null {
  return reason.trim().length < MIN_REJECTION_REASON_LENGTH
    ? `Give a reason of at least ${MIN_REJECTION_REASON_LENGTH} characters`
    : null
}
