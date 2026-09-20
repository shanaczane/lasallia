// apps/web/app/guest/page.tsx
import { redirect } from "next/navigation"

export default function Page() {
  redirect("/guest/dashboard")
}
