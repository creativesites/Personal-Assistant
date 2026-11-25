'use client'

import { useState } from 'react'
import {
  X, Sparkles, Clock, TrendingUp, Calendar, UserMinus,
  TrendingDown, Frown, Zap, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { BriefingInsight } from '../_types/inbox'

const INSIGHT_META: Record<BriefingInsight['type'], {
  Icon: React.FC<{ size?: number; className?: string }>
  chip: string
}> = {
  longest_wait: { Icon: Clock, chip: 'bg-rose-50 text-rose-600' },
  hot_lead: { Icon: TrendingUp, chip: 'bg-amber-50 text-amber-600' },
  upcoming_event: { Icon: Calendar, chip: 'bg-violet-50 text-violet-600' },
  dormant_vip: { Icon: UserMinus, chip: 'bg-sky-50 text-sky-600' },
  health_drop: { Icon: TrendingDown, chip: 'bg-orange-50 text-orange-600' },
  frustrated_contact: { Icon: Frown, chip: 'bg-rose-50 text-rose-600' },
  proactive_queue: { Icon: Zap, chip: 'bg-emerald-50 text-emerald-600' },
}

const URGENCY_RANK: Record<BriefingInsight['urgency'], number> = { critical: 0, high: 1, medium: 2, low: 3 }
const MAX_ROWS = 4

/**
 * A single quiet line ("Zuri · 3 things need you") that expands into a short
 * list. Renders nothing while loading or when there's nothing to act on.
 */
export function DailyBriefing({
  insights,
  loading,
  onDismiss,
  onOpenConversation,
}: {
  name?: string
  insights: BriefingInsight[]
  items?: string[]
  loading: boolean
  onDismiss: () => void
  onOpenConversation?: (conversationId: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (loading || insights.length === 0) return null

  const sorted = [...insights].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
  const top = sorted[0]
  const urgent = sorted.some(i => i.urgency === 'critical' || i.urgency === 'high')

  return (
    <div className="flex-shrink-0 border-b border-gray-100">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left hover:bg-gray-50"
          aria-expanded={open}
        >
          <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-500 text-white">
            <Sparkles size={13} />
            {urgent && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-gray-900">
              {insights.length === 1 ? '1 thing needs you' : `${insights.length} things need you`}
            </span>
            {!open && <span className="block truncate text-[11px] text-gray-500">{top.label}</span>}
          </span>
          <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={onDismiss}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-gray-300 hover:bg-gray-50 hover:text-gray-500"
          title="Hide for today"
        >
          <X size={14} />
        </button>
      </div>

      {open && (
        <ul className="pb-2">
          {sorted.slice(0, MAX_ROWS).map((insight, i) => {
            const { Icon, chip } = INSIGHT_META[insight.type]
            const clickable = !!insight.conversationId && !!onOpenConversation
            return (
              <li key={`${insight.type}-${i}`}>
                <button
                  disabled={!clickable}
                  onClick={() => clickable && onOpenConversation!(insight.conversationId!)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left enabled:hover:bg-gray-50"
                >
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${chip}`}>
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-gray-800">{insight.label}</span>
                    <span className="block truncate text-[11px] text-gray-500">{insight.detail}</span>
                  </span>
                  {clickable && <ChevronRight size={13} className="flex-shrink-0 text-gray-300" />}
                </button>
              </li>
            )
          })}
          {sorted.length > MAX_ROWS && (
            <li className="px-4 pt-1 text-[11px] text-gray-400">+{sorted.length - MAX_ROWS} more on your dashboard</li>
          )}
        </ul>
      )}
    </div>
  )
}
