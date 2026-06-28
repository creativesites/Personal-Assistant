'use client'

import { ReactNode } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'

interface FeatureGateProps {
  modes?: WorkspaceMode[]
  tiers?: string[]
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ modes, children, fallback = null }: FeatureGateProps) {
  const session = useZuriSession()
  const mode = session.data?.mode ?? 'business'

  if (modes && modes.length > 0 && !modes.includes(mode)) {
    return <>{fallback}</>
  }

  // tier check wired in Phase 3 when subscription data is in the session
  return <>{children}</>
}
