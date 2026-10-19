// Guesses a college code (lib/colleges.ts) from a profile's `program`, for
// profiles with no college set. Checks the program list first, then
// keywords for older typed-in values. Returns null if nothing matches; add
// keywords below for values that don't resolve.
import { COLLEGES } from './colleges'
import { collegeCodeForProgram } from './programs'

const KEYWORD_TO_COLLEGE: [RegExp, string][] = [
  // Order matters: specific programs come before broad words like
  // "engineering" or "business".
  [/\bcite\b|computer science|information tech|computer eng|electronics eng|electrical eng|industrial eng|civil eng|chemical eng|mechanical eng|engineering/i, 'CITE'],
  [/\bcbeam\b|accountancy|business admin|management accounting|marketing|financial management|\beconomics\b|entrepreneur|\bbusiness\b/i, 'CBEAM'],
  [/\bceas\b|education|psychology|communication|political science|criminology|\bbiology\b|arts and sciences|arts & sciences/i, 'CEAS'],
  [/\bcithm\b|tourism|hospitality/i, 'CITHM'],
  [/college of nursing|\bnursing\b|pharmacy|medical tech|medical laboratory|physical therapy/i, 'CON'],
  [/graduate school|\bmasters?\b|\bdoctor(al)? of|\bphd\b/i, 'GRADUATE SCHOOL'],
  [/gen-ad|general admission|general academics|undeclared/i, 'GEN-AD'],
]

export function collegeForProgram(program: string | null | undefined): string | null {
  if (!program) return null
  const trimmed = program.trim()
  const exact = COLLEGES.find((c) => c.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact
  const fromRoster = collegeCodeForProgram(trimmed)
  if (fromRoster) return fromRoster
  for (const [pattern, college] of KEYWORD_TO_COLLEGE) {
    if (pattern.test(trimmed)) return college
  }
  return null
}
