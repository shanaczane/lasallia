// apps/web/app/librarian/layout.tsx
import { LibrarianLayout } from "@/components/layout/LibrarianLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LibrarianLayout userName="Shan Cruz" userInitials="SC">
      {children}
    </LibrarianLayout>
  )
}