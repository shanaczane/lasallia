// apps/web/proxy.ts
// Route-level gate for /librarian/* — this is routing convenience only, NOT
// the security boundary. The "lasallia_role" cookie is written client-side
// (see lib/auth.ts) and can be forged, so every request that touches
// librarian-only data must still verify the caller's role server-side —
// the same job a Postgres RLS policy would do if this were backed by
// Supabase. The API stub does not enforce that yet; this proxy only keeps
// the wrong role from landing on a librarian page in the UI.

import { NextResponse, type NextRequest } from 'next/server'

const SESSION_ROLE_COOKIE = 'lasallia_role'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const role = request.cookies.get(SESSION_ROLE_COOKIE)?.value

  if (!role) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (role !== 'librarian') {
    return NextResponse.redirect(new URL('/student/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/librarian/:path*'],
}
