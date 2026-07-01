// apps/web/lib/mock/patrons.ts
// Sprint 5.5 — Static mock data for Librarian "Manage Users" (Patrons) screen
// Replace with real API calls in a later backend sprint (GET /api/librarian/users)

import type { UserProfile, UserRole, UserAccountStatus } from '@lasallia/types'

// ─── Patron directory (5.5.1) ────────────────────────────────────────────────

export const MOCK_PATRONS: UserProfile[] = [
  { id: 'p1',  email: 'shan.cruz@dlsl.edu.ph',      full_name: 'Shan Cruz',        role: 'student',   program: 'BS Computer Science',  year_level: 3, status: 'active',   created_at: '2024-06-01T00:00:00Z' },
  { id: 'p2',  email: 'miguel.santos@dlsl.edu.ph',  full_name: 'Miguel Santos',    role: 'student',   program: 'BS Information Tech',  year_level: 2, status: 'active',   created_at: '2024-06-01T00:00:00Z' },
  { id: 'p3',  email: 'ana.reyes@dlsl.edu.ph',      full_name: 'Ana Reyes',        role: 'student',   program: 'BS Nursing',           year_level: 4, status: 'active',   created_at: '2024-06-01T00:00:00Z' },
  { id: 'p4',  email: 'j.delacruz@dlsl.edu.ph',     full_name: 'Jerome Dela Cruz', role: 'faculty',   program: 'College of Engineering', status: 'active',   created_at: '2023-08-15T00:00:00Z' },
  { id: 'p5',  email: 'k.villanueva@dlsl.edu.ph',   full_name: 'Kristine Villanueva', role: 'student', program: 'BS Accountancy',      year_level: 1, status: 'inactive', created_at: '2025-01-10T00:00:00Z' },
  { id: 'p6',  email: 'r.bautista@dlsl.edu.ph',     full_name: 'Rico Bautista',    role: 'student',   program: 'BS Computer Science',  year_level: 3, status: 'active',   created_at: '2024-06-01T00:00:00Z' },
  { id: 'p7',  email: 'l.fernandez@dlsl.edu.ph',    full_name: 'Liza Fernandez',   role: 'faculty',   program: 'College of Business',  status: 'active',   created_at: '2022-11-03T00:00:00Z' },
  { id: 'p8',  email: 'p.mendoza@dlsl.edu.ph',      full_name: 'Paolo Mendoza',    role: 'student',   program: 'BS Information Tech',  year_level: 2, status: 'inactive', created_at: '2024-06-01T00:00:00Z' },
  { id: 'p9',  email: 's.garcia@dlsl.edu.ph',       full_name: 'Sofia Garcia',     role: 'student',   program: 'BS Psychology',        year_level: 1, status: 'active',   created_at: '2025-06-01T00:00:00Z' },
  { id: 'p10', email: 'c.torres@dlsl.edu.ph',       full_name: 'Carlo Torres',     role: 'student',   program: 'BS Computer Science',  year_level: 4, status: 'active',   created_at: '2022-06-01T00:00:00Z' },
  { id: 'p11', email: 'n.aquino@dlsl.edu.ph',       full_name: 'Nadine Aquino',    role: 'librarian', program: 'LRC Staff',            status: 'active',   created_at: '2021-03-20T00:00:00Z' },
  { id: 'p12', email: 'd.ramos@dlsl.edu.ph',        full_name: 'Diego Ramos',      role: 'student',   program: 'BS Nursing',           year_level: 2, status: 'active',   created_at: '2024-06-01T00:00:00Z' },
  { id: 'p13', email: 'b.morales@dlsl.edu.ph',      full_name: 'Bea Morales',      role: 'faculty',   program: 'College of Arts & Sciences', status: 'inactive', created_at: '2020-07-01T00:00:00Z' },
  { id: 'p14', email: 't.pascual@dlsl.edu.ph',      full_name: 'Tomas Pascual',    role: 'student',   program: 'BS Accountancy',       year_level: 3, status: 'active',   created_at: '2023-06-01T00:00:00Z' },
]

export const ROLE_LABEL: Record<UserRole, string> = {
  student: 'Student',
  faculty: 'Faculty',
  librarian: 'Librarian',
  guest: 'Guest',
}

export const STATUS_LABEL: Record<UserAccountStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
}

// ─── Per-patron activity, for the profile modal (5.5.2) ─────────────────────

export type PatronLoan = {
  bookId: string
  title: string
  borrowedDate: string
  dueDate: string
  status: 'active' | 'due_soon' | 'overdue'
}

export type PatronReservation = {
  bookId: string
  title: string
  requestedDate: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
}

export type PatronHistoryEntry = {
  bookId: string
  title: string
  borrowedDate: string
  returnedDate: string
  status: 'returned' | 'overdue_returned'
}

export type PatronActivity = {
  activeLoans: PatronLoan[]
  reservations: PatronReservation[]
  history: PatronHistoryEntry[]
}

const EMPTY_ACTIVITY: PatronActivity = { activeLoans: [], reservations: [], history: [] }

export const MOCK_PATRON_ACTIVITY: Record<string, PatronActivity> = {
  p1: {
    activeLoans: [
      { bookId: '1', title: 'Clean Code',          borrowedDate: 'Jun 8, 2026',  dueDate: 'Jun 22, 2026', status: 'overdue' },
      { bookId: '4', title: 'Design Patterns',      borrowedDate: 'Jun 14, 2026', dueDate: 'Jun 28, 2026', status: 'due_soon' },
    ],
    reservations: [
      { bookId: '6', title: 'The Pragmatic Programmer', requestedDate: 'Jun 20, 2026', status: 'pending' },
    ],
    history: [
      { bookId: '3', title: 'Refactoring', borrowedDate: 'Apr 28, 2026', returnedDate: 'May 20, 2026', status: 'overdue_returned' },
      { bookId: '2', title: 'Clean Architecture', borrowedDate: 'Mar 1, 2026', returnedDate: 'Mar 14, 2026', status: 'returned' },
    ],
  },
  p2: {
    activeLoans: [
      { bookId: '5', title: 'Introduction to Algorithms', borrowedDate: 'Jun 20, 2026', dueDate: 'Jul 4, 2026', status: 'active' },
    ],
    reservations: [],
    history: [
      { bookId: '7', title: 'Database System Concepts', borrowedDate: 'May 2, 2026', returnedDate: 'May 16, 2026', status: 'returned' },
    ],
  },
  p6: {
    activeLoans: [
      { bookId: '8', title: 'Computer Networking', borrowedDate: 'Jun 18, 2026', dueDate: 'Jul 2, 2026', status: 'active' },
    ],
    reservations: [
      { bookId: '1', title: 'Clean Code', requestedDate: 'Jun 25, 2026', status: 'confirmed' },
    ],
    history: [],
  },
  p10: {
    activeLoans: [],
    reservations: [],
    history: [
      { bookId: '4', title: 'Design Patterns', borrowedDate: 'Jan 10, 2026', returnedDate: 'Jan 24, 2026', status: 'returned' },
      { bookId: '2', title: 'Clean Architecture', borrowedDate: 'Feb 2, 2026', returnedDate: 'Feb 20, 2026', status: 'overdue_returned' },
      { bookId: '5', title: 'Introduction to Algorithms', borrowedDate: 'Mar 5, 2026', returnedDate: 'Mar 19, 2026', status: 'returned' },
    ],
  },
}

export function getPatronActivity(userId: string): PatronActivity {
  return MOCK_PATRON_ACTIVITY[userId] ?? EMPTY_ACTIVITY
}