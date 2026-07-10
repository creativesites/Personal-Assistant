'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'

interface AuthCtaProps {
  className?: string
  loggedOut: { href: string; children: ReactNode }
  loggedIn: { href: string; children: ReactNode }
}

// Swaps a single CTA's destination + label depending on Clerk auth state —
// a logged-in visitor should never be sent to /register or /login, they
// should go straight to their dashboard/studio. Uses Clerk's own useAuth()
// directly rather than useZuriSession() so this never waits on (or depends
// on the health of) the backend — it only needs to know signed-in or not.
export function AuthCta({ className, loggedOut, loggedIn }: AuthCtaProps) {
  const { isSignedIn } = useAuth()
  const target = isSignedIn ? loggedIn : loggedOut
  return (
    <Link href={target.href} className={className}>
      {target.children}
    </Link>
  )
}
