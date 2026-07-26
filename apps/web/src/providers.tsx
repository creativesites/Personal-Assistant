'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ToastProvider } from '@/components/ui/toast'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/login"
      signUpUrl="/register"
      signInFallbackRedirectUrl="/inbox"
      signUpFallbackRedirectUrl="/onboarding"
    >
      <ToastProvider>
        {children}
        <PwaInstallPrompt />
      </ToastProvider>
    </ClerkProvider>
  )
}
