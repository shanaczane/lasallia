import { GuestLayout } from "@/components/layout/GuestLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GuestLayout>
      {children}
    </GuestLayout>
  )
}