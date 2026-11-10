// The kiosk has no start screen: it opens straight into guest browsing on
// the catalog. Tapping an ID anywhere signs that person in to borrow.

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KioskEntryPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/kiosk/catalog')
  }, [router])
  return null
}
