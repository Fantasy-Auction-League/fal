import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Lightweight middleware that checks for session cookie without importing Prisma
// This avoids bundling the Neon adapter into the Edge Function (>1MB limit)
export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get('authjs.session-token') ||
    request.cookies.get('__Secure-authjs.session-token')

  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!login|api/auth|api/scoring/cron|api/admin/sync-players/cron|_next/static|_next/image|favicon.ico).*)'],
}
