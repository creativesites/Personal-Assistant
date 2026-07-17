'use client'

import { useApi } from './use-api'

// Membership Platform Phase 4 (docs/MEMBERSHIP_PLATFORM_PLAN.md) — a shared
// read of GET /api/subscriptions/me, normalized into the booleans the
// persistent grace-period/read-only banner (and any other page) needs
// without each caller re-deriving them from the raw status string.

export interface SubscriptionMe {
  plan: string
  planName: string | null
  status: string
  currentPeriodEnd: string | null
  gracePeriodEndsAt: string | null
  credits: {
    messagesRemaining: number
    messagesPerDay: number | null
    aiRepliesRemaining: number
    aiRepliesPerDay: number | null
    nudgesRemaining: number
    nudgesPerDay: number | null
    documentsRemaining: number
    documentsPerDay: number | null
  }
  pendingPayment: { referenceCode: string; amountFormatted: string; planName: string } | null
  mobileMoneyNumbers: { airtel: string; mtn: string }
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

export function useSubscriptionStatus(token: string | null | undefined) {
  const { data, loading, error, refetch } = useApi<SubscriptionMe>('/api/subscriptions/me', token)

  return {
    data,
    loading,
    error,
    refetch,
    isGracePeriod: data?.status === 'grace_period',
    isReadOnly: data?.status === 'read_only',
    isPendingPayment: data?.status === 'pending_payment',
    isPaymentRejected: data?.status === 'payment_rejected',
    daysUntilGraceEnds: daysUntil(data?.gracePeriodEndsAt ?? null),
  }
}
