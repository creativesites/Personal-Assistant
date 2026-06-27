import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/register(.*)',
  '/api/auth/clerk-sync(.*)',
  '/api/proxy/(.*)',        // proxy to ECS — auth enforced by the API server's own JWT
  '/api/diagnostics/(.*)', // internal diagnostics
])

const isApiRoute = createRouteMatcher(['/api/(.*)'])

export default clerkMiddleware(async (auth, request) => {
  updateSession(request)

  if (!isPublicRoute(request)) {
    const { userId } = await auth()
    if (!userId) {
      // API routes: return 401 JSON instead of redirecting to /login
      if (isApiRoute(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
}
