// Maps a profile program ("BS Computer Science") to the catalog's program
// name ("Computer Science"). Programs with no books return null.

// Roster names whose catalog Program isn't just the name minus its degree
// prefix. Everything else falls through to the prefix-stripping match below.
const PROGRAM_TO_CATALOG: Record<string, string> = {
  "BS Accountancy": "Accountancy AIS",
  "BS Accounting Information System": "Accountancy AIS",
  "Accounting Information System": "Accountancy AIS",
  // Spellings found on real profiles that don't follow the roster's names.
  "BMMA": "Multimedia Arts",
  "Multi Media Arts": "Multimedia Arts",
  "BSBA MM": "Marketing",
  "AB Communication": "ABCOMMUNICATION",
  "Bachelor of Elementary Education": "Education",
  "Bachelor of Secondary Education": "Education",
  "BSBA Marketing Management": "Marketing",
  "BS Hospitality Management": "HRM",
  "Certificate in Hospitality Management": "HRM",
  "BS Tourism Management": "Tourism",
  "Cookery NC II (Culinary Arts)": "Culinary Arts",
  "Certificate in Entrepreneurship": "Entrepreneurship",
  "Associate in Computer Technology": "Information Technology",
  "Master in Business Administration": "Graduate Program",
  "Master in Management Technology": "Graduate Program",
  "Juris Doctor Program": "Graduate Program",
}

const DEGREE_PREFIX = /^(bsba|bs|ab|bachelor of|master of arts in|master of|master in|certificate in|associate in)\s+/i

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * The catalog Program to filter by for this patron's program, or null when
 * the catalog has no matching Program. `genres` is the catalog's current
 * Program list, so the result is always a value that actually has books.
 */
export function catalogProgramFor(
  program: string | null | undefined,
  genres: string[],
): string | null {
  if (!program) return null
  const trimmed = program.trim()
  const byNorm = new Map(genres.map((g) => [norm(g), g]))

  const candidates = [
    PROGRAM_TO_CATALOG[trimmed],
    // Graduate degrees all shelve together.
    /^(master|doctor)/i.test(trimmed) ? "Graduate Program" : undefined,
    trimmed,
    trimmed.replace(DEGREE_PREFIX, ""),
  ].filter((c): c is string => !!c)

  for (const c of candidates) {
    const hit = byNorm.get(norm(c))
    if (hit) return hit
  }

  // Some sheet names were cut off at Excel's 31-character limit
  // ("Entertainment and Multimedia Co"), so allow a prefix match.
  const stripped = norm(trimmed.replace(DEGREE_PREFIX, ""))
  if (stripped.length >= 8) {
    const hit = genres.find((g) => norm(g).length >= 8 && stripped.startsWith(norm(g)))
    if (hit) return hit
  }
  return null
}
