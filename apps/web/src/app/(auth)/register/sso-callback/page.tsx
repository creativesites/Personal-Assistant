'use client'

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

// Handles the OAuth redirect back from Google (and other social providers).
// Clerk redirects to /register/sso-callback after the provider completes auth.
export default function RegisterSSOCallback() {
  return (
    <AuthenticateWithRedirectCallback
      signInForceRedirectUrl="/inbox"
      signUpForceRedirectUrl="/onboarding"
    />
  )
}
