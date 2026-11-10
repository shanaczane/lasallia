// Shown to anyone browsing as a guest. The kiosk has no login page, so it
// passes no loginHref and only asks for an ID tap.

import Link from "next/link"

export function GuestBanner({ loginHref }: { loginHref?: string }) {
  return (
    <p
      role="status"
      className="px-4 sm:px-6 py-2 bg-gold-100 text-ink-800 border-b border-gold-500"
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
    >
      You are browsing as a Guest.{" "}
      {loginHref ? (
        <>
          <Link href={loginHref} className="font-semibold underline">Log in</Link> or tap your ID to borrow and reserve.
        </>
      ) : (
        "Tap your school ID to borrow."
      )}
    </p>
  )
}
