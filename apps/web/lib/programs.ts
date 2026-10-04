// apps/web/lib/programs.ts
// Canonical DLSL program roster, grouped by college, backing the student
// Program field in CompleteProfileModal.tsx. That field used to be free
// text, so the same program ended up typed as "bs computer science",
// "BS COMPUTER SCIENCE", "Computer Science", etc. — lists, filters, and
// reports never agreed on a program's spelling. A fixed dropdown makes
// every new value exactly one of these strings.
//
// `collegeCode` is the code lib/colleges.ts already uses to tag catalog
// books (CITE/CBEAM/CEAS/CITHM/HEALTH-ALLIED/GEN-AD/GRADUATE SCHOOL) — a
// separate, closed taxonomy tied to the Excel source files in
// apps/api/data. Several real DLSL colleges below (Nursing, Law, Criminal
// Justice Education) don't have their own catalog code, so they fold into
// the closest existing one (see per-group comments) purely so "for you"
// book recommendations keep working; it has no bearing on the program
// label itself. See collegeForProgram.ts, which consumes this list.
//
// "Graduate Programs" in the source roster was a cross-college summary
// (its entries already appear under their home college above), so it's
// folded into CBEAM/CEAS below rather than kept as its own group — every
// program appears exactly once.

export type ProgramGroup = {
  college: string
  collegeCode: string
  programs: string[]
}

export const PROGRAM_GROUPS: ProgramGroup[] = [
  {
    college: "College of Business, Economics, Accountancy and Management",
    collegeCode: "CBEAM",
    programs: [
      "BS Accountancy",
      "BS Accounting Information System",
      "BS Legal Management",
      "BS Entrepreneurship",
      "BS Management Technology",
      "BSBA Financial Management",
      "BSBA Marketing Management",
      "Certificate in Entrepreneurship",
      "Master in Business Administration",
      "Master in Management Technology",
    ],
  },
  {
    college: "College of Education, Arts and Sciences",
    collegeCode: "CEAS",
    programs: [
      "Bachelor of Elementary Education",
      "Bachelor of Secondary Education",
      "AB Communication",
      "Bachelor of Multimedia Arts",
      "BS Biology",
      "BS Psychology",
      "Master of Arts in Education major in Educational Management",
      "Master of Arts in Education major in English",
      "Master of Arts in Education major in Filipino",
      "Master of Arts in Education major in Mathematics",
    ],
  },
  {
    college: "College of International Hospitality and Tourism Management",
    collegeCode: "CITHM",
    programs: [
      "BS Hospitality Management",
      "BS Tourism Management",
      "Cookery NC II (Culinary Arts)",
      "Certificate in Hospitality Management",
    ],
  },
  {
    college: "College of Information Technology and Engineering",
    collegeCode: "CITE",
    programs: [
      "BS Architecture",
      "BS Computer Engineering",
      "BS Computer Science",
      "BS Electrical Engineering",
      "BS Electronics Engineering",
      "BS Entertainment and Multimedia Computing",
      "BS Industrial Engineering",
      "BS Information Technology",
      "Associate in Computer Technology",
    ],
  },
  {
    college: "College of Nursing",
    // No dedicated catalog code for Nursing — HEALTH-ALLIED is the closest
    // existing one (see the "allied health" keyword in collegeForProgram.ts).
    collegeCode: "HEALTH-ALLIED",
    programs: ["BS Nursing"],
  },
  {
    college: "College of Law",
    // Juris Doctor is a post-baccalaureate professional doctorate, so it
    // folds into the GRADUATE SCHOOL catalog code rather than going uncoded.
    collegeCode: "GRADUATE SCHOOL",
    programs: ["Juris Doctor Program"],
  },
  {
    college: "College of Criminal Justice Education",
    // No dedicated catalog code — CEAS already covers the closest existing
    // discipline (criminology, per collegeForProgram.ts's keyword list).
    collegeCode: "CEAS",
    programs: ["Bachelor of Forensic Science"],
  },
]

export const PROGRAMS: string[] = PROGRAM_GROUPS.flatMap((g) => g.programs)

const PROGRAM_TO_COLLEGE_CODE: Record<string, string> = Object.fromEntries(
  PROGRAM_GROUPS.flatMap((g) => g.programs.map((p) => [p, g.collegeCode]))
)

export function collegeCodeForProgram(program: string | null | undefined): string | null {
  if (!program) return null
  return PROGRAM_TO_COLLEGE_CODE[program.trim()] ?? null
}
