// What each user type is called, and the line shown for a person on the
// TopNav, the kiosk and the desk. Only the ordinal helper is imported, so
// lib/roles.test.ts runs without the app.

import type { UserRole } from "@lasallia/types"
import { ordinal } from "./ordinal.ts"

export const ROLE_LABEL: Record<UserRole, string> = {
  student: "Student",
  faculty: "Faculty/Lasallian Partner",
  librarian: "Librarian",
  guest: "Guest",
}

export type RoleDetails = {
  college?: string | null
  yearLevel?: number | null
  // The active librarian profile, under the shared login.
  profileName?: string | null
}

// Missing details are left out, so an unfinished profile reads "Student".
export function roleLine(role: UserRole, details: RoleDetails = {}): string {
  const parts: (string | null | undefined)[] = [ROLE_LABEL[role]]
  if (role === "student") {
    parts.push(details.college, details.yearLevel ? `${ordinal(details.yearLevel)} Year` : null)
  } else if (role === "librarian") {
    parts.push(details.profileName)
  }
  return parts.filter(Boolean).join(" · ")
}
