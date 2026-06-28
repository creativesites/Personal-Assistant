'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ToastProvider } from '@/components/ui/toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <ToastProvider>{children}</ToastProvider>
    </ClerkProvider>
  )
}
