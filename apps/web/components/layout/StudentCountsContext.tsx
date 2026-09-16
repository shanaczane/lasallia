"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { fetchReservations } from "@/lib/reservations"
import { fetchLoans } from "@/lib/kiosk"

type StudentCountsContextType = {
  activeReservationCount: number
  activeLoanCount: number
  refreshReservationCount: () => void
  refreshLoanCount: () => void
}

const StudentCountsContext = createContext<StudentCountsContextType>({
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
  const [activeReservationCount, setActiveReservationCount] = useState(0)
  const [activeLoanCount, setActiveLoanCount] = useState(0)

  function refreshReservationCount() {
    fetchReservations()
      .then((rows) => setActiveReservationCount(rows.filter((r) => r.status === "pending" || r.status === "ready").length))
      .catch(() => {})
  }

  function refreshLoanCount() {
    fetchLoans()
      .then((rows) => setActiveLoanCount(rows.filter((l) => l.status !== "returned").length))
      .catch(() => {})
  }

  useEffect(() => {
    refreshReservationCount()
    refreshLoanCount()
  }, [])

  return (
    <StudentCountsContext.Provider
      value={{ activeReservationCount, activeLoanCount, refreshReservationCount, refreshLoanCount }}
    >
      {children}
    </StudentCountsContext.Provider>
  )
}
