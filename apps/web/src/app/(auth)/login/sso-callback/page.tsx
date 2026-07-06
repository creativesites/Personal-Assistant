'use client'

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

// Handles the OAuth redirect back from Google (and other social providers).
// Clerk redirects to /login/sso-callback after the provider completes auth.
export default function LoginSSOCallback() {
  return (
    <AuthenticateWithRedirectCallback
      signInForceRedirectUrl="/inbox"
      signUpForceRedirectUrl="/onboarding"
    />
  )
}
