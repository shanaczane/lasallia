// apps/web/lib/hooks/useReservations.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Reservation } from '@lasallia/types'
import { fetchReservations } from '@/lib/reservations'

export function useReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchReservations()
      .then(setReservations)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reservations'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { reservations, loading, error, refresh }
}
