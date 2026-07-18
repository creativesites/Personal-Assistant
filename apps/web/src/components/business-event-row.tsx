'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles, DollarSign, Trophy, CheckCircle2, UserX, AlertTriangle, X,
  Users2, Send, Check, RefreshCw, ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { apiClient } from '@/lib/api'
import { businessEventLabel, businessEventDetail } from '@/lib/business-event-labels'

// Shared row renderer for a business_events row — used by both the
// first-class /feed page and Studio Overview's compact "Zuri Noticed" card,
// so the two surfaces never drift out of sync with two hand-copied
// implementations (Business Documents Overhaul, Phase 6 — see
// docs/BUSINESS_EVENTS_PLAN.md Part F / docs/PLATFORM_POLISH_PLAN.md §7.2).
//
// "Actionable feed" pass: a row is no longer a dead end — the backend
// (GET /api/business-feed's computeAction()) works out, from the event's
// own payload, whether there's a real one-tap action available (merge two
// duplicate contacts, send an already-drafted check-in, or hand off to
// Studio's AI Business Advisor with a prefilled prompt) and this component
// executes it directly, the same "one shared implementation, not per-page
// hand copies" reasoning that created this file in the first place.

export type BusinessEventAction =
  | { type: 'merge_contacts'; contactAId: string; contactAName: string; contactBId: string; contactBName: string }
  | { type: 'send_proactive'; proactiveId: string; draftMessage: string }
  | { type: 'ask_ai'; prompt: string }
  | null

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
  action?: BusinessEventAction
}

const CATEGORY_VISUALS: Record<string, { icon: typeof Sparkles; bg: string; fg: string; accent: string }> = {
  payment_posted: { icon: DollarSign, bg: 'bg-emerald-50', fg: 'text-emerald-600', accent: '#34d399' },
  milestone_invoice_paid: { icon: Trophy, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
  milestone_deal_closed: { icon: Trophy, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
  project_completed: { icon: CheckCircle2, bg: 'bg-indigo-50', fg: 'text-indigo-600', accent: '#6366f1' },
  contact_gone_quiet: { icon: UserX, bg: 'bg-rose-50', fg: 'text-rose-600', accent: '#fb7185' },
  dormant_customer_alert: { icon: UserX, bg: 'bg-rose-50', fg: 'text-rose-600', accent: '#fb7185' },
  contradiction_invoice_paid_deal_open: { icon: AlertTriangle, bg: 'bg-orange-50', fg: 'text-orange-600', accent: '#fb923c' },
  contradiction_negative_inventory: { icon: AlertTriangle, bg: 'bg-orange-50', fg: 'text-orange-600', accent: '#fb923c' },
  contradiction_project_complete_tasks_incomplete: { icon: AlertTriangle, bg: 'bg-orange-50', fg: 'text-orange-600', accent: '#fb923c' },
  low_stock_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
  thin_margin_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
  supplier_flag_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
  unmet_demand_alert: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
  duplicate_contact_detected: { icon: Users2, bg: 'bg-violet-50', fg: 'text-violet-600', accent: '#a78bfa' },
  invoice_gap: { icon: AlertTriangle, bg: 'bg-amber-50', fg: 'text-amber-600', accent: '#fbbf24' },
}

function eventVisual(eventType: string) {
  return CATEGORY_VISUALS[eventType] ?? { icon: Sparkles, bg: 'bg-indigo-50', fg: 'text-indigo-600', accent: '#818cf8' }
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

function ConfidenceMeter({ value, compact }: { value: number; compact?: boolean }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-1.5">
      <div className={`${compact ? 'w-8' : 'w-12'} h-1 rounded-full bg-gray-100 overflow-hidden`}>
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-gray-400">{pct}%</span>
    </div>
  )
}

function MergeAction({
  action, token, compact, onDone,
}: { action: Extract<BusinessEventAction, { type: 'merge_contacts' }>; token?: string; compact?: boolean; onDone?: () => void }) {
  const { addToast } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [merging, setMerging] = useState(false)
  const [done, setDone] = useState(false)

  async function handleMerge() {
    setMerging(true)
    try {
      await apiClient(`/api/contacts/${action.contactAId}/merge`, {
        method: 'POST', token, body: JSON.stringify({ duplicateContactId: action.contactBId }),
      })
      addToast({ variant: 'success', title: `Merged ${action.contactBName} into ${action.contactAName}` })
      setDone(true)
      onDone?.()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to merge contacts' })
    } finally {
      setMerging(false)
    }
  }

  if (done) return <Badge variant="success">Merged</Badge>

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-500`}>
          Merge <strong className="text-gray-700">{action.contactBName}</strong> into <strong className="text-gray-700">{action.contactAName}</strong>?
        </span>
        <button
          onClick={handleMerge}
          disabled={merging}
          className="min-h-7 px-2.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1"
        >
          {merging ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Confirm
        </button>
        <button onClick={() => setConfirming(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="min-h-7 px-2.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 inline-flex items-center gap-1 ring-1 ring-violet-100"
    >
      <Users2 className="w-3 h-3" />
      Review & Merge
    </button>
  )
}

function SendProactiveAction({
  action, token, compact, onDone,
}: { action: Extract<BusinessEventAction, { type: 'send_proactive' }>; token?: string; compact?: boolean; onDone?: () => void }) {
  const { addToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      await apiClient(`/api/proactive/${action.proactiveId}/send`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Message sent' })
      setSent(true)
      onDone?.()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to send' })
    } finally {
      setSending(false)
    }
  }

  if (sent) return <Badge variant="success">Sent</Badge>

  return (
    <div className="space-y-1.5">
      {expanded && (
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-600 bg-gray-50 rounded-lg px-2.5 py-2 italic`}>
          "{action.draftMessage}"
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending}
          className="min-h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
        >
          {sending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Send Now
        </button>
        {!expanded && (
          <button onClick={() => setExpanded(true)} className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-0.5">
            Preview <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function AskAiAction({ action, compact }: { action: Extract<BusinessEventAction, { type: 'ask_ai' }>; compact?: boolean }) {
  return (
    <Link
      href={`/studio?tab=overview&prompt=${encodeURIComponent(action.prompt)}`}
      className="min-h-7 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 inline-flex items-center gap-1 ring-1 ring-indigo-100"
    >
      <Sparkles className="w-3 h-3" />
      Ask AI
    </Link>
  )
}

export function BusinessEventRow({
  event, compact, token, onDismiss, onActionComplete,
}: {
  event: BusinessEvent
  compact?: boolean
  token?: string
  onDismiss?: (id: string) => void
  onActionComplete?: () => void
}) {
  const { icon: Icon, bg, fg, accent } = eventVisual(event.eventType)
  const label = businessEventLabel(event.eventType)
  const detail = businessEventDetail(event.eventType, event.payload, event.contactName)
  const href = relatedLink(event.payload)

  return (
    <div
      className={`relative bg-white ${compact ? 'rounded-xl py-2.5 px-2.5' : 'rounded-2xl py-3.5 px-4'} border border-gray-100 shadow-sm shadow-gray-200/40 hover:shadow-md transition-shadow`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-start gap-3">
        <div className={`${compact ? 'w-8 h-8 rounded-xl' : 'w-9 h-9 rounded-2xl'} ${bg} ${fg} flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-900`}>
              {href ? (
                <Link href={href} className="hover:text-indigo-600 hover:underline">
                  {label}{detail ? `: ${detail}` : ''}
                </Link>
              ) : (
                <>{label}{detail ? `: ${detail}` : ''}</>
              )}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{relativeTime(event.createdAt)}</span>
              {onDismiss && event.status !== 'dismissed' && (
                <button
                  onClick={() => onDismiss(event.id)}
                  title="Dismiss"
                  className="min-w-7 min-h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {event.evidence.length > 0 && (
            <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-500 mt-0.5 ${compact ? 'truncate' : ''}`}>{event.evidence[0]}</p>
          )}

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {event.confidence != null && <ConfidenceMeter value={event.confidence} compact={compact} />}
            {event.status === 'bundled' && <Badge variant="purple">In pending bundle</Badge>}
            {event.status === 'dismissed' && <Badge variant="default">Dismissed</Badge>}
          </div>

          {event.action && event.status !== 'dismissed' && (
            <div className="mt-2">
              {event.action.type === 'merge_contacts' && (
                <MergeAction action={event.action} token={token} compact={compact} onDone={onActionComplete} />
              )}
              {event.action.type === 'send_proactive' && (
                <SendProactiveAction action={event.action} token={token} compact={compact} onDone={onActionComplete} />
              )}
              {event.action.type === 'ask_ai' && <AskAiAction action={event.action} compact={compact} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
