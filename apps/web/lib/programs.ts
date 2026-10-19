// The official DLSL program list, grouped by college, for the profile's
// Program dropdown. Each program appears once.
//
// `collegeCode` is the catalog college code (lib/colleges.ts). Law and
// Criminal Justice have no code of their own, so they use the closest one.

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
    collegeCode: "CON",
    programs: ["BS Nursing"],
  },
  {
    college: "College of Law",
    // Juris Doctor is a graduate degree.
    collegeCode: "GRADUATE SCHOOL",
    programs: ["Juris Doctor Program"],
  },
  {
    college: "College of Criminal Justice Education",
    // No catalog code of its own; CEAS is the closest.
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
