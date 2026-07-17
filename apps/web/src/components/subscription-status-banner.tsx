'use client'

import Link from 'next/link'
import { AlertTriangle, Lock } from 'lucide-react'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'

// Membership Platform Phase 4 (docs/MEMBERSHIP_PLATFORM_PLAN.md) — a
// persistent (not dismissible-forever) banner for grace_period/read_only,
// mounted once in the dashboard layout so every page shows it. Never a
// blocking modal — full feature access continues through grace_period, and
// even read_only always allows view/search/export, per the "never lock a
// user out of their own data" design principle.

export function SubscriptionStatusBanner({ token }: { token: string | null | undefined }) {
  const { isGracePeriod, isReadOnly, daysUntilGraceEnds, data } = useSubscriptionStatus(token)

  if (!isGracePeriod && !isReadOnly) return null

  if (isReadOnly) {
    return (
      <div className="flex items-center gap-3 bg-rose-600 px-4 py-2.5 text-white">
        <Lock className="h-4 w-4 flex-shrink-0" />
        <p className="min-w-0 flex-1 text-xs font-semibold">
          Your account is in read-only mode. Your data is safe — view, search, and export still work. Renew to resume creating and generating.
        </p>
        <Link
          href="/billing"
          className="flex-shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors"
        >
          Renew now
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 bg-amber-500 px-4 py-2.5 text-white">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <p className="min-w-0 flex-1 text-xs font-semibold">
        Your {data?.planName ?? 'plan'} has expired — you're in a grace period
        {daysUntilGraceEnds !== null ? ` (${daysUntilGraceEnds} day${daysUntilGraceEnds === 1 ? '' : 's'} left)` : ''}.
        Everything still works. Renew before it ends to avoid read-only mode.
      </p>
      <Link
        href="/billing"
        className="flex-shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors"
      >
        Renew now
      </Link>
    </div>
  )
}
