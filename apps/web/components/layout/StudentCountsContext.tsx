"use client"

import { createContext, useContext, useState } from "react"
import { usePolling } from "@/lib/hooks/usePolling"
import { fetchReservations } from "@/lib/reservations"
import { fetchLoans, type Loan } from "@/lib/kiosk"
import type { Reservation } from "@lasallia/types"

// loans/reservations are the rows behind the two badge counts. The layout
// already fetches them on every student page, so the dashboard reads them
// from here instead of asking the API for the same data a second time.
// loaded flips true once both first fetches have settled.
type StudentCountsContextType = {
  loans: Loan[]
  reservations: Reservation[]
  loaded: boolean
  activeReservationCount: number
  activeLoanCount: number
  refreshReservationCount: () => void
  refreshLoanCount: () => void
}

const StudentCountsContext = createContext<StudentCountsContextType>({
  loans: [],
  reservations: [],
  loaded: false,
  activeReservationCount: 0,
  activeLoanCount: 0,
  refreshReservationCount: () => {},
  refreshLoanCount: () => {},
})

export function useStudentCounts() {
  return useContext(StudentCountsContext)
}

// Sidebar badge counts (Reservations, My Library) — self-fetching, same
// reasoning as NotificationContext: a layout.tsx prop can only ever guess.
// Exposed as context so pages that mutate a reservation or loan (cancel,
// pick up, reserve) can call the matching refresh function after their own
// action succeeds, instead of the sidebar only catching up on next reload.
export function StudentCountsProvider({ children }: { children: React.ReactNode }) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [reservationsLoaded, setReservationsLoaded] = useState(false)
  const [loansLoaded, setLoansLoaded] = useState(false)
  const activeReservationCount = reservations.filter((r) => r.status === "pending" || r.status === "ready").length
  const activeLoanCount = loans.filter((l) => l.status !== "returned").length

  function refreshReservationCount() {
    fetchReservations()
      .then(setReservations)
      .catch(() => {})
      .finally(() => setReservationsLoaded(true))
  }

  function refreshLoanCount() {
    fetchLoans()
      .then(setLoans)
      .catch(() => {})
      .finally(() => setLoansLoaded(true))
  }

  // First load, then again every 90s and whenever the tab returns to the
  // front — so a loan made at the kiosk shows up here without a reload.
  usePolling(() => {
    refreshReservationCount()
    refreshLoanCount()
  }, 90_000)

  return (
    <StudentCountsContext.Provider
      value={{
        loans,
        reservations,
        loaded: reservationsLoaded && loansLoaded,
        activeReservationCount,
        activeLoanCount,
        refreshReservationCount,
        refreshLoanCount,
      }}
    >
      {children}
    </StudentCountsContext.Provider>
  )
}
