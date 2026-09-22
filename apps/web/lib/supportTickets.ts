// apps/web/lib/supportTickets.ts
// Fetch layer for /support-tickets. Submit and track are public (no auth —
// the login page is exactly where a locked-out user ends up); list and
// update are the librarian inbox, same auth pattern as lib/reservations.ts.

import { getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type TicketCategory = "login" | "technical" | "account" | "other"
export type TicketStatus = "open" | "in_progress" | "resolved"

export type SupportTicket = {
  id: string
  ticket_number: string
  name: string
  email: string
  category: TicketCategory
  message: string
  status: TicketStatus
  resolution_note: string | null
  handled_by: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export type TicketStatusView = {
  ticket_number: string
  category: TicketCategory
  status: TicketStatus
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function createSupportTicket(fields: {
  name: string
  email: string
  category: TicketCategory
  message: string
}): Promise<SupportTicket> {
  const res = await fetch(`${API_URL}/support-tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not submit your ticket")
  return res.json()
}

export async function trackSupportTicket(ticketNumber: string, email: string): Promise<TicketStatusView> {
  const res = await fetch(`${API_URL}/support-tickets/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_number: ticketNumber, email }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "No ticket found with that number and email")
  return res.json()
}

export async function fetchSupportTickets(status?: TicketStatus): Promise<SupportTicket[]> {
  const qs = status ? `?ticket_status=${encodeURIComponent(status)}` : ""
  const res = await fetch(`${API_URL}/support-tickets${qs}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load support tickets")
  return res.json()
}

export async function updateSupportTicket(
  id: string,
  changes: { status?: TicketStatus; resolution_note?: string }
): Promise<SupportTicket> {
  const res = await fetch(`${API_URL}/support-tickets/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(changes),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not update this ticket")
  return res.json()
}
