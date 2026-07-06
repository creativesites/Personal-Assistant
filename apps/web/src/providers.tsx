'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ToastProvider } from '@/components/ui/toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/login"
      signUpUrl="/register"
      signInFallbackRedirectUrl="/inbox"
      signUpFallbackRedirectUrl="/onboarding"
    >
      <ToastProvider>{children}</ToastProvider>
    </ClerkProvider>
  )
}
