// apps/web/lib/hooks/useBorrowTransactions.ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { BorrowStatus, BorrowTransaction } from '@lasallia/types'
import { fetchBorrowTransactions } from '@/lib/borrow'

export function useBorrowTransactions(status?: BorrowStatus) {
  const [transactions, setTransactions] = useState<BorrowTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchBorrowTransactions(status ? { status } : undefined)
      .then(setTransactions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load borrow transactions'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { transactions, loading, error, refresh }
}
