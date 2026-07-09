'use client'

import { ReactNode } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'
type MarketingAccess = 'none' | 'waitlisted' | 'beta' | 'enabled'

interface FeatureGateProps {
  modes?: WorkspaceMode[]
  /** Gate on a product entitlement (e.g. Zuri Marketing's `/studio`), not workspace mode. */
  entitlements?: MarketingAccess[]
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ modes, entitlements, children, fallback = null }: FeatureGateProps) {
  const session = useZuriSession()
  const mode = session.data?.mode ?? 'business'
  const marketingAccess = session.data?.marketingAccess ?? 'none'

  if (modes && modes.length > 0 && !modes.includes(mode)) {
    return <>{fallback}</>
  }

  if (entitlements && entitlements.length > 0 && !entitlements.includes(marketingAccess)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
