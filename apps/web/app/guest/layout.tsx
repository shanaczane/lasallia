// apps/web/app/guest/layout.tsx
import { GuestLayout } from "@/components/layout/GuestLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GuestLayout>
      {children}
    </GuestLayout>
  )
}