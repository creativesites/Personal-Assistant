'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { PageHeader, SkeletonCard } from '@/components/ui'
import { GuidedPaymentModal, type GuidedPaymentPlan } from './_components/guided-payment-modal'

// See docs/PRICING_PAYMENTS_PLAN.md §5/§9 — this page is the first real
// backing endpoint /billing has ever had (previously wired to a
// never-implemented GET /api/billing).

const PENDING_PLAN_STORAGE_KEY = 'zuri_pending_plan_id'

interface SubscriptionMe {
  plan: string
  planName: string | null
  status: string
  currentPeriodEnd: string | null
  credits: {
    messagesRemaining: number
    messagesPerDay: number | null
    aiRepliesRemaining: number
    aiRepliesPerDay: number | null
    nudgesRemaining: number
    nudgesPerDay: number | null
  }
  pendingPayment: { referenceCode: string; amountFormatted: string; planName: string } | null
  mobileMoneyNumbers: { airtel: string; mtn: string }
}

interface Plan {
  id: string
  key: string
  name: string
  priceNgwee: number
  priceFormatted: string
  priceNgweeByok: number | null
  priceByokFormatted: string | null
  planFamily: string | null
  billingPeriod: string | null
  isCustomPricing: boolean
  durationDays: number
  messagesPerDay: number
  aiRepliesPerDay: number
  proactiveNudgesPerDay: number
  documentsPerDay: number
}

function CreditBar({ label, remaining, perDay }: { label: string; remaining: number; perDay: number | null }) {
  const isUnlimited = (perDay ?? 0) >= 999999
  const pct = isUnlimited || !perDay ? 100 : Math.max(0, Math.min(100, Math.round((remaining / perDay) * 100)))
  const isLow = !isUnlimited && perDay && pct <= 20
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {isUnlimited ? 'Unlimited' : `${remaining.toLocaleString()} / ${(perDay ?? 0).toLocaleString()}`}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-amber-400' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function durationLabel(days: number): string {
  if (days === 1) return '/day'
  if (days === 7) return '/week'
  return '/month'
}

export default function BillingPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const { data: sub, loading: subLoading, refetch: refetchSub } = useApi<SubscriptionMe>('/api/subscriptions/me', token)
  const { data: catalog, loading: plansLoading } = useApi<{ plans: Plan[] }>('/api/subscription-plans', token)
  const { data: byokKeys } = useApi<{ keys: unknown[] }>('/api/byok', token)

  const [guidedPlan, setGuidedPlan] = useState<GuidedPaymentPlan | null>(null)

  function toGuidedPlan(plan: Plan): GuidedPaymentPlan {
    return {
      id: plan.id,
      name: plan.name,
      priceFormatted: plan.priceFormatted,
      priceNgweeByok: plan.priceNgweeByok,
      priceByokFormatted: plan.priceByokFormatted,
      billingPeriod: plan.billingPeriod,
    }
  }

  // Resume a checkout started while signed out from /pricing — the chosen
  // plan is stashed in localStorage before the redirect through /register.
  useEffect(() => {
    if (!token || !catalog) return
    const pendingPlanId = window.localStorage.getItem(PENDING_PLAN_STORAGE_KEY)
    if (!pendingPlanId) return
    window.localStorage.removeItem(PENDING_PLAN_STORAGE_KEY)
    const plan = catalog.plans.find((p) => p.id === pendingPlanId)
    if (plan) setGuidedPlan(toGuidedPlan(plan))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, catalog])

  const loading = session.status === 'loading' || subLoading

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Billing" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  const isPending = sub?.status === 'pending_payment'
  const isRejected = sub?.status === 'payment_rejected'

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Billing" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Current plan */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-200 font-medium uppercase tracking-wide">Current plan</p>
                  <p className="text-xl font-bold text-white mt-0.5">{sub?.planName ?? sub?.plan ?? 'Free'}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  sub?.status === 'active' || sub?.status === 'trialing'
                    ? 'bg-green-400/20 text-green-100'
                    : 'bg-white/20 text-white'
                }`}>
                  {sub?.status ?? 'free'}
                </span>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                  {(session.data?.user.name || session.data?.user.email || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{session.data?.user.name || session.data?.user.email}</p>
                </div>
              </div>
              {sub?.currentPeriodEnd && (
                <p className="text-xs text-gray-500">
                  Renews {new Date(sub.currentPeriodEnd).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Pending payment */}
          {isPending && sub?.pendingPayment && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-amber-900 mb-1">Payment pending</p>
              <p className="text-xs text-amber-700 mb-4">
                Usually approved within an hour. Send exactly <strong>{sub.pendingPayment.amountFormatted}</strong> to one
                of the numbers below with the reference code, then wait — your {sub.pendingPayment.planName} credits
                unlock the moment it's confirmed.
              </p>
              <div className="bg-white rounded-lg border border-amber-200 px-4 py-3 mb-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Reference code</p>
                <p className="text-lg font-mono font-bold text-gray-900 tracking-wider">{sub.pendingPayment.referenceCode}</p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="bg-white rounded-lg border border-amber-200 px-3 py-2">
                  <span className="font-semibold text-gray-700">Airtel Money:</span>{' '}
                  <span className="text-gray-600">{sub.mobileMoneyNumbers.airtel}</span>
                </div>
                <div className="bg-white rounded-lg border border-amber-200 px-3 py-2">
                  <span className="font-semibold text-gray-700">MTN MoMo:</span>{' '}
                  <span className="text-gray-600">{sub.mobileMoneyNumbers.mtn}</span>
                </div>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-red-900 mb-1">Payment not confirmed</p>
              <p className="text-xs text-red-700">
                We couldn't match your last payment (wrong amount or reference). Pick a plan below to try again.
              </p>
            </div>
          )}

          {/* Credits */}
          {sub?.credits && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Today's AI credits</p>
              <div className="space-y-4">
                <CreditBar label="Messages analysed" remaining={sub.credits.messagesRemaining} perDay={sub.credits.messagesPerDay} />
                <CreditBar label="AI reply drafts" remaining={sub.credits.aiRepliesRemaining} perDay={sub.credits.aiRepliesPerDay} />
                <CreditBar label="Proactive nudges" remaining={sub.credits.nudgesRemaining} perDay={sub.credits.nudgesPerDay} />
              </div>
              <p className="text-[11px] text-gray-400 mt-4">
                Credits reset daily. Upgrade to a higher plan to raise your limits immediately.
              </p>
            </div>
          )}

          {/* Zambia mobile money notice */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0" aria-hidden="true">🇿🇲</span>
            <div>
              <p className="text-sm font-semibold text-green-900">Mobile money payments</p>
              <p className="text-xs text-green-700 mt-0.5">
                Pay with Airtel Money or MTN Mobile Money. Choose a plan below, then send the exact amount with your
                reference code — an admin confirms it, usually within an hour.
              </p>
            </div>
          </div>

          {/* Plan picker */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plans</p>
            </div>
            <div className="divide-y divide-gray-50">
              {plansLoading && <div className="p-5"><SkeletonCard /></div>}
              {catalog?.plans.filter(p => p.key !== 'free').map((plan) => {
                const isCurrent = sub?.plan === plan.key
                return (
                  <div key={plan.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {plan.name}
                        {isCurrent && (
                          <span className="ml-2 text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">Current</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {plan.messagesPerDay >= 999999 ? 'Unlimited' : plan.messagesPerDay} messages/day ·{' '}
                        {plan.aiRepliesPerDay >= 999999 ? 'unlimited' : plan.aiRepliesPerDay} AI replies/day ·{' '}
                        {plan.proactiveNudgesPerDay >= 999999 ? 'unlimited' : plan.proactiveNudgesPerDay} nudges/day
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-bold text-gray-900">
                        {plan.priceFormatted}<span className="text-xs text-gray-400">{durationLabel(plan.durationDays)}</span>
                      </p>
                      <button
                        onClick={() => setGuidedPlan(toGuidedPlan(plan))}
                        disabled={isCurrent}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isCurrent ? 'Current' : 'Subscribe'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center pb-2">
            Questions about billing? <a href="mailto:hello@zuri.ai" className="hover:underline">Contact support</a>
          </p>
        </div>
      </div>

      <GuidedPaymentModal
        plan={guidedPlan}
        token={token}
        hasByokKey={(byokKeys?.keys.length ?? 0) > 0}
        onClose={() => setGuidedPlan(null)}
        onDone={() => refetchSub()}
      />
    </div>
  )
}
