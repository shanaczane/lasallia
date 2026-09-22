// apps/web/app/student/layout.tsx
import { StudentLayout } from "@/components/layout/StudentLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // userName/userInitials are just an SSR-safe fallback — StudentLayoutInner
    // immediately overrides them from getUser() on mount. initialUnread has no
    // such override (NotificationContext only ever gets a real count from its
    // own fetch), so a hardcoded placeholder here isn't harmless the same way —
    // it was showing every student a fake "4" unread badge. Omitted, so it
    // defaults to 0 (NotificationProvider's own default) until the real count
    // loads, same as LibrarianLayout already does.
    <StudentLayout userName="Shan Cruz" userInitials="SC">
      {children}
    </StudentLayout>
  )
}