'use client'

import { CheckCircle2, Clock, CreditCard, XCircle } from 'lucide-react'

export interface TimelineEntry {
  source: 'event' | 'payment'
  id: string
  createdAt: string
  label: string
  detail: Record<string, unknown>
}

const EVENT_LABELS: Record<string, string> = {
  trial_started: 'Trial started',
  payment_approved: 'Payment approved',
  payment_rejected: 'Payment rejected',
  entered_grace_period: 'Entered grace period',
  entered_read_only: 'Switched to read-only',
  trial_ended: 'Trial ended',
  grace_period_last_day_warning: 'Grace period last-day reminder',
}

function iconFor(entry: TimelineEntry) {
  if (entry.source === 'payment') {
    if (entry.label === 'approved') return { Icon: CheckCircle2, color: 'text-emerald-500' }
    if (entry.label === 'rejected') return { Icon: XCircle, color: 'text-rose-500' }
    return { Icon: Clock, color: 'text-amber-500' }
  }
  if (entry.label.startsWith('expiry_reminder') || entry.label === 'grace_period_last_day_warning') {
    return { Icon: Clock, color: 'text-amber-500' }
  }
  if (entry.label === 'entered_read_only') return { Icon: XCircle, color: 'text-rose-500' }
  return { Icon: CreditCard, color: 'text-indigo-500' }
}

function labelFor(entry: TimelineEntry): string {
  if (entry.source === 'payment') {
    const ref = typeof entry.detail.referenceCode === 'string' ? ` (${entry.detail.referenceCode})` : ''
    return `Payment ${entry.label}${ref}`
  }
  return EVENT_LABELS[entry.label] ?? entry.label.replace(/_/g, ' ')
}

function dateLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const diffDays = Math.floor((today.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString([], { day: 'numeric', month: 'long' })
}

// Membership Platform Phase 5 — the Billing Timeline: one merged
// chronological feed reading subscription_events + payment_requests
// (GET /api/billing/timeline).
export function BillingTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) {
    return (
      <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-2">Activity</p>
        <p className="text-xs text-gray-400">No billing activity yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 overflow-hidden">
      <p className="text-sm font-semibold text-gray-900 px-4 pt-4 pb-2">Activity</p>
      <div>
        {entries.map((entry) => {
          const { Icon, color } = iconFor(entry)
          return (
            <div key={`${entry.source}-${entry.id}`} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3.5 last:border-b-0 hover:bg-gray-50/80">
              <div className={`w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate">{labelFor(entry)}</p>
              </div>
              <span className="text-[11px] text-gray-400 flex-shrink-0">{dateLabel(entry.createdAt)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
