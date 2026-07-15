'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  History, Sparkles, Target, Heart, Briefcase, Loader2,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { EmptyState, SkeletonCard } from '@/components/ui'

// Zuri Neural Layer Phase 3 — Life Timeline (docs/NEURAL_LAYER_PLAN.md
// §4.7/§10). A merged chronological narrative over signals every other
// engine already writes — weekly reflections, goal milestones, contact
// life events, closed deals — not a new detector or a new source of truth.

interface TimelineEntry {
  source: 'reflection' | 'goal_event' | 'life_event' | 'deal_closed'
  id: string
  eventDate: string
  label: string
  detail: Record<string, any>
}

const SOURCE_STYLE: Record<TimelineEntry['source'], { Icon: React.ComponentType<{ className?: string }>; bg: string; color: string }> = {
  reflection: { Icon: Sparkles, bg: 'bg-indigo-50', color: 'text-indigo-600' },
  goal_event: { Icon: Target, bg: 'bg-cyan-50', color: 'text-cyan-600' },
  life_event: { Icon: Heart, bg: 'bg-rose-50', color: 'text-rose-600' },
  deal_closed: { Icon: Briefcase, bg: 'bg-emerald-50', color: 'text-emerald-600' },
}

function describe(entry: TimelineEntry): string {
  switch (entry.source) {
    case 'reflection': {
      const highlights = Array.isArray(entry.detail) ? entry.detail : []
      return highlights.length > 0
        ? `Week in review: ${highlights.map((h: any) => h.text).join(' ')}`
        : 'Week in review generated.'
    }
    case 'goal_event':
      return `${entry.detail.title ?? 'A goal'} — ${entry.detail.description ?? entry.label}`
    case 'life_event':
      return `${entry.detail.title ?? entry.label}${entry.detail.contactName ? ` (${entry.detail.contactName})` : ''}`
    case 'deal_closed': {
      const amount = typeof entry.detail.valueCents === 'number'
        ? (entry.detail.valueCents / 100).toLocaleString(undefined, { style: 'currency', currency: entry.detail.currency ?? 'ZMW' })
        : null
      return entry.label === 'closed_won'
        ? `Won deal: ${entry.detail.title ?? ''}${amount ? ` (${amount})` : ''}`
        : `Lost deal: ${entry.detail.title ?? ''}`
    }
    default:
      return entry.label
  }
}

export default function TimelinePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    apiClient<{ timeline: TimelineEntry[] }>('/api/reflection/timeline', { token })
      .then(data => { setEntries(data.timeline); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const grouped = useMemo(() => {
    const byMonth = new Map<string, TimelineEntry[]>()
    for (const entry of entries) {
      const d = new Date(entry.eventDate)
      const key = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key)!.push(entry)
    }
    return Array.from(byMonth.entries())
  }, [entries])

  return (
    <div className="bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <div className="p-4 md:p-6 pb-0">
        <div className="relative rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40 ring-1 ring-white p-5 md:p-6 max-w-4xl mx-auto w-full">
          <div className="absolute inset-0 rounded-[2rem] overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
          </div>
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              Zuri Neural Layer
            </span>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-gray-950 mt-3">Life Timeline</h1>
            <p className="text-sm text-gray-600 max-w-xl mt-1 leading-relaxed">
              A chronological narrative of your year — weekly reflections, goal milestones, relationship
              life events, and closed deals, all in one place.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
        {loading ? (
          <div className="space-y-4 mt-4">
            {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : grouped.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<History className="w-10 h-10 text-indigo-500" />}
              title="Your timeline is still empty"
              description="Once Zuri generates weekly reflections and detects goal milestones or life events, they'll appear here in order."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-8">
            {grouped.map(([month, items]) => (
              <div key={month}>
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 mb-3">{month}</h2>
                <div className="relative pl-6 space-y-3 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
                  {items.map(entry => {
                    const { Icon, bg, color } = SOURCE_STYLE[entry.source]
                    return (
                      <div key={`${entry.source}-${entry.id}`} className="relative flex items-start gap-3">
                        <div className={`absolute -left-6 top-0.5 w-6 h-6 rounded-full ${bg} ${color} flex items-center justify-center ring-4 ring-[#f8fafc]`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <div className="flex-1 rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 px-4 py-3">
                          <p className="text-sm text-gray-800">{describe(entry)}</p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {new Date(entry.eventDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
