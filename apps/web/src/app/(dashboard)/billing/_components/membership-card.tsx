'use client'

import { ProgressRing } from './progress-ring'

interface MembershipCardProps {
  planName: string | null
  status: string
  currentPeriodEnd: string | null
  gracePeriodEndsAt: string | null
  onUpgrade: () => void
  onManage: () => void
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  grace_period: 'Grace period',
  read_only: 'Read-only',
  pending_payment: 'Pending payment',
  payment_rejected: 'Payment not confirmed',
  expired: 'Expired',
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
}

// Membership Platform Phase 5 — the Membership Card + Progress Ring the
// product brief asked for: plan, status, valid-until date, and a
// days-remaining ring, in the hero-card gradient pattern from CLAUDE.md's
// Design System section.
export function MembershipCard({
  planName, status, currentPeriodEnd, gracePeriodEndsAt, onUpgrade, onManage,
}: MembershipCardProps) {
  const targetDate = status === 'grace_period' ? gracePeriodEndsAt : currentPeriodEnd
  const daysRemaining = targetDate
    ? Math.max(0, Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86_400_000))
    : null
  const ringLabel = status === 'grace_period' ? 'days of grace left' : 'days remaining'

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-600 to-cyan-500 shadow-2xl shadow-indigo-500/30 ring-1 ring-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(255,255,255,0.18),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(255,255,255,0.12),transparent_30%)]" />
      <div className="relative p-5 md:p-7 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
            {STATUS_LABEL[status] ?? status}
          </span>
          <p className="text-2xl md:text-3xl font-black tracking-tight text-white mt-3">{planName ?? 'Free'}</p>
          {targetDate && (
            <p className="text-xs text-white/70 mt-1">
              {status === 'grace_period' ? 'Read-only starts' : 'Valid until'} {formatDate(targetDate)}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={onUpgrade}
              className="rounded-2xl bg-white text-indigo-700 px-4 py-2 text-xs font-bold shadow-lg hover:bg-indigo-50 transition-colors"
            >
              {status === 'grace_period' || status === 'read_only' ? 'Renew now' : 'Upgrade'}
            </button>
            <button
              onClick={onManage}
              className="rounded-2xl bg-white/15 text-white px-4 py-2 text-xs font-bold hover:bg-white/25 transition-colors"
            >
              Manage
            </button>
          </div>
        </div>
        {daysRemaining !== null && (
          <ProgressRing daysRemaining={daysRemaining} totalDays={daysRemaining <= 7 ? 7 : 30} label={ringLabel} />
        )}
      </div>
    </div>
  )
}
