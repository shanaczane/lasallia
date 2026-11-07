// Which role may open which area, for proxy.ts. A UI convenience only: the
// role cookie can be forged, so the API checks every request itself.

const AREAS: { prefix: string; roles: string[] }[] = [
  { prefix: "/librarian", roles: ["librarian"] },
  // Faculty use the same pages as students.
  { prefix: "/user", roles: ["student", "faculty"] },
]

const HOMES: Record<string, string> = {
  librarian: "/librarian/dashboard",
  student: "/user/dashboard",
  faculty: "/user/dashboard",
  guest: "/guest/dashboard",
}

function inArea(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// Where to send this visitor instead, or null to let them through.
export function guardRoute(pathname: string, role: string | undefined): string | null {
  const area = AREAS.find((a) => inArea(pathname, a.prefix))
  if (!area) return null
  if (!role || !(role in HOMES)) return `/login?next=${encodeURIComponent(pathname)}`
  return area.roles.includes(role) ? null : HOMES[role]
}
