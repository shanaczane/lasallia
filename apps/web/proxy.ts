// apps/web/proxy.ts
// Route-level gate for /librarian/* and /user/* — this is routing convenience
// only, NOT the security boundary. The "lasallia_role" cookie is written
// client-side (see lib/auth.ts) and can be forged, so every request that
// touches protected data is checked by the API and Postgres RLS. This proxy
// only keeps the wrong role from landing on a page in the UI. /guest, /kiosk,
// /login, /auth, /privacy and /borrow stay public.

import { NextResponse, type NextRequest } from 'next/server'
import { guardRoute } from '@/lib/routeGuard'

const SESSION_ROLE_COOKIE = 'lasallia_role'

export function proxy(request: NextRequest) {
  const role = request.cookies.get(SESSION_ROLE_COOKIE)?.value
  const redirect = guardRoute(request.nextUrl.pathname, role)
  return redirect ? NextResponse.redirect(new URL(redirect, request.url)) : NextResponse.next()
}

export const config = {
  matcher: ['/librarian/:path*', '/user/:path*'],
}
