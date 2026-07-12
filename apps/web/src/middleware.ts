import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const isPublicRoute = createRouteMatcher([
  '/',
  '/whatsapp(.*)',
  '/marketing(.*)',
  '/how-it-works(.*)',
  '/pricing(.*)',
  '/privacy(.*)',
  '/retail(.*)',
  '/mechanics(.*)',
  '/clinics(.*)',
  '/real-estate(.*)',
  '/restaurants(.*)',
  '/travel(.*)',
  '/legal(.*)',
  '/schools(.*)',
  '/admin-setup(.*)',
  '/login(.*)',
  '/register(.*)',
  '/api/auth/clerk-sync(.*)',
  '/api/proxy/(.*)',        // proxy to ECS — auth enforced by the API server's own JWT
  '/api/diagnostics/(.*)', // internal diagnostics
])

// Auth pages that signed-in users should be bounced away from
const isAuthRoute = createRouteMatcher(['/login(.*)', '/register(.*)'])

const isApiRoute = createRouteMatcher(['/api/(.*)'])

export default clerkMiddleware(async (auth, request) => {
  await updateSession(request)

  const { userId } = await auth()

  // ── Authenticated user on login/register → send to inbox ─────────────────
  if (userId && isAuthRoute(request)) {
    return NextResponse.redirect(new URL('/inbox', request.url))
  }

  // ── Unauthenticated user on protected route → send to login ──────────────
  if (!userId && !isPublicRoute(request)) {
    if (isApiRoute(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
}
