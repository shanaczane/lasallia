// apps/web/app/student/layout.tsx
import { StudentLayout } from "@/components/layout/StudentLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <StudentLayout userName="Shan Cruz" userInitials="SC" initialUnread={4}>
      {children}
    </StudentLayout>
  )
}