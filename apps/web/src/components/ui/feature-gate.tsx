import { ReactNode } from 'react'
import type { WorkspaceMode } from './mode-badge'

interface FeatureGateProps {
  modes?: WorkspaceMode[]
  tiers?: string[]
  children: ReactNode
  fallback?: ReactNode
}

// Phase 1 stub — always renders children.
// Phase 2 wires this to useZuriSession to check mode + subscription tier.
export function FeatureGate({ children }: FeatureGateProps) {
  return <>{children}</>
}
