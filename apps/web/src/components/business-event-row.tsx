'use client'

import Link from 'next/link'
import {
  Sparkles, DollarSign, Trophy, CheckCircle2, UserX, AlertTriangle, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { businessEventLabel, businessEventDetail } from '@/lib/business-event-labels'

// Shared row renderer for a business_events row — used by both the
// first-class /feed page and Studio Overview's compact "Zuri Noticed" card,
// so the two surfaces never drift out of sync with two hand-copied
// implementations (Business Documents Overhaul, Phase 6 — see
// docs/BUSINESS_EVENTS_PLAN.md Part F / docs/PLATFORM_POLISH_PLAN.md §7.2).

export interface BusinessEvent {
  id: string
  eventType: string
  confidence: number | null
  evidence: string[]
  payload: Record<string, unknown>
  status: string
  bundleId: string | null
  contactName: string | null
  createdAt: string
}

const CATEGORY_VISUALS: Record<string, { icon: typeof Sparkles; bg: string; fg: string }> = {
  payment_posted: { icon: DollarSign, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  milestone_invoice_paid: { icon: Trophy, bg: 'bg-amber-50', fg: 'text-amber-600' },
  milestone_deal_closed: { icon: Trophy, bg: 'bg-amber-50', fg: 'text-amber-600' },
  project_completed: { icon: CheckCircle2, bg: 'bg-indigo-50', fg: 'text-indigo-600' },
  contact_gone_quiet: { icon: UserX, bg: 'bg-rose-50', fg: 'text-rose-600' },
  dormant_customer_alert: { icon: UserX, bg: 'bg-rose-50', fg: 'text-rose-600' },
  contradiction_invoice_paid_deal_open: { icon: AlertTriangle, bg: 'bg-orange-50', fg: 'text-orange-600' },
  contradiction_negative_inventory: { icon: AlertTriangle, bg: 'bg-orange-50', fg: 'text-orange-600' },
  contradiction_project_complete_tasks_incomplete: { icon: AlertTriangle, bg: 'bg-orange-50', fg: 'text-orange-600' },
  low_stock_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600' },
  thin_margin_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600' },
  supplier_flag_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600' },
  unmet_demand_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600' },
  duplicate_contact_detected: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600' },
  invoice_gap: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600' },
}

function eventVisual(eventType: string) {
  return CATEGORY_VISUALS[eventType] ?? { icon: Sparkles, bg: 'bg-indigo-50', fg: 'text-indigo-600' }
}

function relatedLink(payload: Record<string, unknown>): string | null {
  // No standalone /deals/[id] route exists yet — deals surface within
  // /leads and a contact's own page, so a dealId-only payload has nothing
  // to link to today.
  if (typeof payload.contactId === 'string') return `/contacts/${payload.contactId}`
  if (typeof payload.projectId === 'string') return `/projects/${payload.projectId}`
  if (typeof payload.documentId === 'string') return `/documents/${payload.documentId}`
  return null
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function BusinessEventRow({
  event, compact, onDismiss,
}: { event: BusinessEvent; compact?: boolean; onDismiss?: (id: string) => void }) {
  const { icon: Icon, bg, fg } = eventVisual(event.eventType)
  const label = businessEventLabel(event.eventType)
  const detail = businessEventDetail(event.eventType, event.payload, event.contactName)
  const href = relatedLink(event.payload)

  const iconChip = (
    <div className={`${compact ? 'w-8 h-8 rounded-xl' : 'w-9 h-9 rounded-2xl'} ${bg} ${fg} flex items-center justify-center shrink-0 mt-0.5`}>
      <Icon className="w-4 h-4" />
    </div>
  )

  const body = (
    <div className="min-w-0 flex-1">
      <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-900`}>
        {href ? (
          <Link href={href} className="hover:text-indigo-600 hover:underline">
            {label}{detail ? `: ${detail}` : ''}
          </Link>
        ) : (
          <>{label}{detail ? `: ${detail}` : ''}</>
        )}
      </p>
      {event.evidence.length > 0 && (
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-500 mt-0.5 ${compact ? 'truncate' : ''}`}>{event.evidence[0]}</p>
      )}
      <div className="flex items-center gap-2 mt-1">
        {event.confidence != null && (
          <span className="text-[10px] font-semibold text-gray-400">
            {Math.round(event.confidence * 100)}% confident
          </span>
        )}
        {event.status === 'bundled' && <Badge variant="purple">In pending bundle</Badge>}
        {event.status === 'dismissed' && <Badge variant="default">Dismissed</Badge>}
      </div>
    </div>
  )

  return (
    <div className={`flex items-start gap-3 border-b border-gray-50 ${compact ? 'py-2.5' : 'px-4 py-3.5'} last:border-b-0 hover:bg-gray-50/80`}>
      {iconChip}
      {body}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-gray-400 mt-1">{relativeTime(event.createdAt)}</span>
        {onDismiss && event.status !== 'dismissed' && (
          <button
            onClick={() => onDismiss(event.id)}
            title="Dismiss"
            className="min-w-8 min-h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
