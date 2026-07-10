'use client'

import {
  X, Sparkles, Clock, TrendingUp, Calendar, UserMinus,
  TrendingDown, Frown, Zap, CheckCircle,
} from 'lucide-react'
import { getGreeting } from '../_lib/utils'
import type { BriefingInsight } from '../_types/inbox'

// ── Icon + colour map ──────────────────────────────────────────────────────────

const INSIGHT_META: Record<BriefingInsight['type'], {
  Icon: React.FC<{ size?: number; className?: string }>
  bg: string
  ring: string
  text: string
  dot: string
}> = {
  longest_wait: {
    Icon: Clock,
    bg: 'bg-red-500/10',
    ring: 'ring-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-500',
  },
  hot_lead: {
    Icon: TrendingUp,
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-500/20',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  upcoming_event: {
    Icon: Calendar,
    bg: 'bg-violet-500/10',
    ring: 'ring-violet-500/20',
    text: 'text-violet-400',
    dot: 'bg-violet-400',
  },
  dormant_vip: {
    Icon: UserMinus,
    bg: 'bg-sky-500/10',
    ring: 'ring-sky-500/20',
    text: 'text-sky-400',
    dot: 'bg-sky-400',
  },
  health_drop: {
    Icon: TrendingDown,
    bg: 'bg-orange-500/10',
    ring: 'ring-orange-500/20',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
  },
  frustrated_contact: {
    Icon: Frown,
    bg: 'bg-rose-500/10',
    ring: 'ring-rose-500/20',
    text: 'text-rose-400',
    dot: 'bg-rose-500',
  },
  proactive_queue: {
    Icon: Zap,
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
}

const URGENCY_BADGE: Record<BriefingInsight['urgency'], string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  medium: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

// ── InsightCard ────────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  onClick,
}: {
  insight: BriefingInsight
  onClick?: () => void
}) {
  const meta = INSIGHT_META[insight.type]
  const { Icon } = meta
  const isClickable = !!(insight.conversationId || insight.contactId) && !!onClick

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      className={`flex-shrink-0 w-[200px] flex flex-col gap-2 p-3 rounded-xl ring-1 transition-all text-left
        ${meta.bg} ${meta.ring}
        ${isClickable ? 'hover:brightness-110 active:scale-95 cursor-pointer' : 'cursor-default'}
      `}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg} ring-1 ${meta.ring}`}>
          <Icon size={13} className={meta.text} />
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${URGENCY_BADGE[insight.urgency]}`}>
          {insight.urgency}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-white leading-tight truncate">
          {insight.label}
        </p>
        <p className="text-[11px] text-white/60 leading-snug mt-0.5 line-clamp-2">
          {insight.detail}
        </p>
      </div>

      {/* CTA hint */}
      {isClickable && (
        <p className={`text-[10px] font-semibold ${meta.text} mt-auto`}>
          Open conversation →
        </p>
      )}
    </button>
  )
}

// ── DailyBriefing ─────────────────────────────────────────────────────────────

export function DailyBriefing({
  name,
  insights,
  items,
  loading,
  onDismiss,
  onOpenConversation,
}: {
  name: string
  insights: BriefingInsight[]
  items: string[]
  loading: boolean
  onDismiss: () => void
  onOpenConversation?: (conversationId: string) => void
}) {
  const allClear = !loading && insights.length === 0

  return (
    <div className="mx-3 mt-3 mb-1 rounded-xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-3.5 relative shadow-lg overflow-hidden">
      {/* Subtle texture overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 50%)' }}
      />

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="absolute top-2.5 right-2.5 text-white/40 hover:text-white/80 transition-colors z-10"
      >
        <X size={13} />
      </button>

      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={11} className="text-indigo-300" />
        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">
          AI Daily Briefing
        </p>
      </div>
      <p className="text-sm font-semibold text-white mb-3">
        {getGreeting()}, {name}.
      </p>

      {/* Cards */}
      {loading ? (
        /* Skeleton cards */
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="flex-shrink-0 w-[200px] h-[100px] rounded-xl bg-white/10 animate-pulse"
            />
          ))}
        </div>
      ) : allClear ? (
        /* All clear state */
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5">
          <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">You're all caught up</p>
            <p className="text-[11px] text-white/60">No urgent conversations right now.</p>
          </div>
        </div>
      ) : (
        /* Scrollable insight cards */
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-0.5 px-0.5">
          {insights.map((insight, i) => (
            <InsightCard
              key={`${insight.type}-${i}`}
              insight={insight}
              onClick={
                insight.conversationId && onOpenConversation
                  ? () => onOpenConversation(insight.conversationId!)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
