// apps/web/lib/hooks/useSupportTickets.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchSupportTickets, type SupportTicket } from '@/lib/supportTickets'

export function useSupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchSupportTickets()
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load support tickets'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { tickets, loading, error, refresh, setTickets }
}
