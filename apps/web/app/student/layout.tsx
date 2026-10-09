// apps/web/app/student/layout.tsx
import { StudentLayout } from "@/components/layout/StudentLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // No hardcoded userName/userInitials/initialUnread — StudentLayoutInner
    // fills the name from getUser() on mount, and a placeholder name stayed
    // on screen whenever there was no session (e.g. Back after sign-out)
    // until useRequireSession redirected. initialUnread defaults to 0
    // (NotificationProvider's own default) until the real count loads; a
    // hardcoded value once showed every student a fake "4" unread badge.
    <StudentLayout>
      {children}
    </StudentLayout>
  )
}