'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { EmptyState, SkeletonListItem } from '@/components/ui'
import { BusinessEventRow, type BusinessEvent } from '@/components/business-event-row'

// Business Feed (Platform Polish Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2)
// — the first-class, paginated version of Studio's "Zuri Noticed" card,
// reading the same business_events table via GET /api/business-feed.
// Rebuilt (Business Documents Overhaul Phase 6) with a gradient hero, a
// per-category filter-pill row, and a "Show dismissed" toggle — matching
// this app's established Design System (see CLAUDE.md).

const FILTERS = [
  { key: 'all', label: 'All', eventTypes: null as string[] | null },
  {
    key: 'payments', label: 'Payments & Milestones',
    eventTypes: ['payment_posted', 'milestone_invoice_paid', 'milestone_deal_closed'],
  },
  {
    key: 'projects', label: 'Projects',
    eventTypes: ['project_completed', 'repeat_product_mention'],
  },
  {
    key: 'contacts', label: 'Contacts',
    eventTypes: ['contact_gone_quiet', 'dormant_customer_alert', 'duplicate_contact_detected'],
  },
  {
    key: 'alerts', label: 'Alerts',
    eventTypes: [
      'low_stock_alert', 'thin_margin_alert', 'supplier_flag_alert', 'unmet_demand_alert', 'invoice_gap',
      'contradiction_invoice_paid_deal_open', 'contradiction_negative_inventory',
      'contradiction_project_complete_tasks_incomplete',
    ],
  },
]

export default function BusinessFeedPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [events, setEvents] = useState<BusinessEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState('all')
  const [showDismissed, setShowDismissed] = useState(false)

  const load = useCallback(async (before?: string, opts?: { dismissed?: boolean }) => {
    if (!token) return
    try {
      const params = new URLSearchParams()
      if (before) params.set('cursor', before)
      if (opts?.dismissed) params.set('status', 'dismissed')
      const qs = params.toString()
      const data = await apiClient<{ events: BusinessEvent[]; nextCursor: string | null }>(
        `/api/business-feed${qs ? `?${qs}` : ''}`, { token },
      )
      setEvents(prev => (before ? [...prev, ...data.events] : data.events))
      setCursor(data.nextCursor)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [token])

  useEffect(() => {
    if (token) { setLoading(true); load(undefined, { dismissed: showDismissed }) }
  }, [token, load, showDismissed])

  async function handleDismiss(id: string) {
    setEvents(prev => prev.map(e => (e.id === id ? { ...e, status: 'dismissed' } : e)))
    try {
      await apiClient(`/api/business-feed/${id}/dismiss`, { method: 'POST', token: token ?? undefined })
    } catch {
      // best-effort — a failed dismiss just leaves the row visible on next load
    }
  }

  const activeFilter = FILTERS.find(f => f.key === filter) ?? FILTERS[0]
  const filteredEvents = activeFilter.eventTypes
    ? events.filter(e => activeFilter.eventTypes!.includes(e.eventType))
    : events

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
        <div className="mx-auto w-full max-w-2xl p-4 md:p-6 space-y-3">
          <div className="h-32 rounded-[2rem] bg-white/60 animate-pulse" />
          {Array.from({ length: 6 }, (_, i) => <SkeletonListItem key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6 space-y-4">
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 px-5 py-6 shadow-2xl shadow-indigo-200/40 ring-1 ring-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              Live
            </div>
            <h1 className="mt-3 text-2xl md:text-3xl font-black tracking-tight text-gray-950">
              Zuri Noticed {events.length > 0 ? `${events.length} thing${events.length !== 1 ? 's' : ''}` : 'Something'}
            </h1>
            <p className="mt-1 text-sm text-gray-600">Everything Zuri has detected about your business — products, payments, milestones, and things worth a second look.</p>
          </div>
        </section>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 min-h-9 px-3 rounded-2xl text-xs font-bold transition-colors ${
                  filter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowDismissed(v => !v)}
            className={`shrink-0 min-h-9 px-3 rounded-2xl text-xs font-bold transition-colors ${
              showDismissed ? 'bg-slate-950 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {showDismissed ? 'Showing dismissed' : 'Show dismissed'}
          </button>
        </div>

        {error ? (
          <EmptyState icon={<AlertTriangle className="w-10 h-10 text-amber-400" />} title="Couldn't load the feed" description="Make sure the API server is running." />
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-10 h-10 text-gray-400" />}
            title="Nothing yet"
            description={showDismissed ? "No dismissed events." : "As Zuri detects new products, invoices paid, milestones crossed, and more, they'll show up here."}
          />
        ) : (
          <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
            {filteredEvents.map(ev => (
              <BusinessEventRow key={ev.id} event={ev} onDismiss={showDismissed ? undefined : handleDismiss} />
            ))}
            {cursor && (
              <div className="p-3">
                <button
                  onClick={() => { setLoadingMore(true); load(cursor, { dismissed: showDismissed }) }}
                  disabled={loadingMore}
                  className="w-full min-h-11 rounded-2xl bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
