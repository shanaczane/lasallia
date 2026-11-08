// People's names as the top bar shows them. Names are often typed in all
// capitals ("KHATRINA JOICE G. GONZALES"); those are shown in normal case.
// A name with any lowercase letter is left as typed ("McDonald", "dela Cruz").

// Words that belong to the surname: "Juan Dela Cruz" → "Juan Dela Cruz".
const SURNAME_PARTICLES = new Set(["de", "del", "dela", "delos", "della", "di", "da", "la", "las", "los", "san", "santa", "sta.", "sto.", "van", "von"])
const SUFFIXES = new Set(["jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "v"])
const ROMAN = /^(ii|iii|iv|v)$/i

function capitalise(part: string): string {
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
}

function normalWord(word: string): string {
  if (ROMAN.test(word)) return word.toUpperCase()
  // "MARIE-CLAIRE" → "Marie-Claire", "O'NEIL" → "O'Neil"
  return word.split(/([-'’])/).map((part) => (/^[-'’]$/.test(part) ? part : capitalise(part))).join("")
}

/** The whole name, in normal case when it was typed in capitals. */
export function displayName(fullName: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  const typed = words.join(" ")
  return /[a-z]/.test(typed) ? typed : words.map(normalWord).join(" ")
}

/** First name and surname only, for tight spaces: "Khatrina Gonzales". */
export function shortName(fullName: string | null | undefined): string {
  const words = displayName(fullName).split(" ").filter(Boolean)
  if (words.length <= 2) return words.join(" ")

  let end = words.length
  const suffix = SUFFIXES.has(words[end - 1].toLowerCase()) ? words[--end] : null
  let start = end - 1
  while (start > 1 && SURNAME_PARTICLES.has(words[start - 1].toLowerCase())) start--
  return [words[0], ...words.slice(start, end), ...(suffix ? [suffix] : [])].join(" ")
}
