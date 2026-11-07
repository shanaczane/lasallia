// The librarians' overdue list on Borrow & Return.

import { getToken } from "@/lib/auth"
import type { OverdueRow } from "@/lib/reports"
import type { UserRole } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type OverdueLoan = OverdueRow & {
  studentId: string
  role: UserRole | null
  accession: string | null
  collectionType: string
  libraryHours: number
  lastReminderAt: string | null
  lastReminderKind: string | null
  reminderCount: number
  remindedToday: boolean
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

export async function fetchOverdueList(): Promise<OverdueLoan[]> {
  const res = await fetch(`${API_URL}/overdue`, { headers: authHeaders() })
  if (!res.ok) throw new Error("Could not load the overdue list")
  return res.json()
}

export async function sendOverdueReminder(loanId: string): Promise<void> {
  const res = await fetch(`${API_URL}/overdue/${loanId}/remind`, { method: "POST", headers: authHeaders() })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === "string" ? body.detail : "Could not send the reminder")
  }
}
