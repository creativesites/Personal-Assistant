'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { useZuriSession, type PlanFamily } from '@/hooks/use-zuri-session'
import { EmptyState } from './empty-state'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'
type MarketingAccess = 'none' | 'waitlisted' | 'beta' | 'enabled'

interface FeatureGateProps {
  modes?: WorkspaceMode[]
  /** Gate on a product entitlement (e.g. Zuri Marketing's `/studio`), not workspace mode. */
  entitlements?: MarketingAccess[]
  /**
   * Membership Platform Phase 6 — gate on the Entitlement Engine's plan
   * family (services/api/src/lib/entitlements.ts's PLAN_FEATURES). Renders
   * a locked empty-state with an exact-copy upgrade CTA instead of the
   * plain `fallback` when the session's planFamily doesn't meet this.
   */
  requiredFamily?: PlanFamily
  /** Human-readable feature name for the locked-state copy, e.g. "Business OS". */
  featureLabel?: string
  children: ReactNode
  fallback?: ReactNode
}

const FAMILY_ORDER: PlanFamily[] = ['free', 'personal', 'professional', 'business', 'enterprise']
const FAMILY_LABEL: Record<PlanFamily, string> = {
  free: 'Free', personal: 'Personal', professional: 'Professional', business: 'Business', enterprise: 'Enterprise',
}

export function FeatureGate({ modes, entitlements, requiredFamily, featureLabel, children, fallback = null }: FeatureGateProps) {
  const session = useZuriSession()
  const mode = session.data?.mode ?? 'business'
  const marketingAccess = session.data?.marketingAccess ?? 'none'
  const planFamily = session.data?.planFamily ?? 'free'

  if (modes && modes.length > 0 && !modes.includes(mode)) {
    return <>{fallback}</>
  }

  if (entitlements && entitlements.length > 0 && !entitlements.includes(marketingAccess)) {
    return <>{fallback}</>
  }

  if (requiredFamily && FAMILY_ORDER.indexOf(planFamily) < FAMILY_ORDER.indexOf(requiredFamily)) {
    return (
      <EmptyState
        icon={<Lock className="w-10 h-10 text-indigo-300" />}
        title={`Available on ${FAMILY_LABEL[requiredFamily]}. Upgrade now.`}
        description={featureLabel ? `${featureLabel} isn't included in your current plan.` : "This feature isn't included in your current plan."}
        action={
          <Link
            href="/billing"
            className="rounded-2xl bg-indigo-600 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
          >
            Upgrade now
          </Link>
        }
      />
    )
  }

  return <>{children}</>
}
