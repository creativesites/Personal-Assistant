import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { updateSession } from '@/utils/supabase/middleware'

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/register(.*)',
  '/api/auth/clerk-sync(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  // Refresh Supabase session cookies on every request
  updateSession(request)

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
}
