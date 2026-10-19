import { StudentLayout } from "@/components/layout/StudentLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // The layout loads the user's name and unread count itself.
    <StudentLayout>
      {children}
    </StudentLayout>
  )
}