// apps/web/lib/collegeForProgram.ts
// Best-effort mapping from a patron's stored `program` — a specific degree
// program for students, or a free-text college name for faculty (see
// components/ui/patrons/PatronProfileModal.tsx; there's no separate
// `college` column on UserProfile, or anywhere in the Supabase schema) —
// to one of the catalog's fixed college codes (see lib/colleges.ts). A
// patron's college should read the same way the catalog itself organizes
// collections, not a second, inconsistent spelling of the same college.
//
// Keyword-matched rather than an exact lookup table: real `program` values
// vary in how they're typed ("BS Information Tech" vs "BSIT" vs "BS
// Information Technology"), and DLSL's exact program roster isn't captured
// anywhere in this codebase to build an exact table from. Extend the list
// below if a real program/college string comes through unresolved.
// Returns null rather than guessing when nothing matches — same fallback
// shape as apps/api/scripts/shelf_location.py's UNASSIGNED.
import { COLLEGES } from './colleges'

const KEYWORD_TO_COLLEGE: [RegExp, string][] = [
  // Order matters: "engineering"/"business" are broad fallbacks (a faculty
  // profile may just say "College of Engineering" with no sub-discipline),
  // checked after the more specific programs above them still win first —
  // e.g. "electronics eng" matches its own clause before falling through.
  [/\bcite\b|computer science|information tech|computer eng|electronics eng|electrical eng|industrial eng|civil eng|chemical eng|mechanical eng|engineering/i, 'CITE'],
  [/\bcbeam\b|accountancy|business admin|management accounting|marketing|financial management|\beconomics\b|entrepreneur|\bbusiness\b/i, 'CBEAM'],
  [/\bceas\b|education|psychology|communication|political science|criminology|\bbiology\b|arts and sciences|arts & sciences/i, 'CEAS'],
  [/\bcithm\b|tourism|hospitality/i, 'CITHM'],
  [/health-allied|allied health|\bnursing\b|pharmacy|medical tech|medical laboratory|physical therapy/i, 'HEALTH-ALLIED'],
  [/graduate school|\bmasters?\b|\bdoctor(al)? of|\bphd\b/i, 'GRADUATE SCHOOL'],
  [/gen-ad|general admission|general academics|undeclared/i, 'GEN-AD'],
]

export function collegeForProgram(program: string | null | undefined): string | null {
  if (!program) return null
  const trimmed = program.trim()
  const exact = COLLEGES.find((c) => c.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact
  for (const [pattern, college] of KEYWORD_TO_COLLEGE) {
    if (pattern.test(trimmed)) return college
  }
  return null
}
