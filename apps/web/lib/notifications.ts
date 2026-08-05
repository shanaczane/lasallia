// apps/web/lib/notifications.ts
// Fetch layer for /notifications — RLS scopes every call to the caller's
// own rows (0001_core_schema.sql), so no role branching is needed here.

import { getToken } from "@/lib/auth"
import type { Notification } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}` }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch(`${API_URL}/notifications`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load notifications")
  return res.json()
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const res = await fetch(`${API_URL}/notifications/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not mark this notification as read")
  return res.json()
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${API_URL}/notifications/mark-all-read`, {
    method: "POST",
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) return parseErrorOrThrow(res, "Could not mark all as read")
}
