export { auth as middleware } from '@/auth'

export const config = {
  // Protect all routes except public ones
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login|register).*)',
  ],
}
