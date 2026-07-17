'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { businessEventLabel, businessEventDetail } from '@/lib/business-event-labels'
import { Badge, EmptyState, PageHeader, SkeletonListItem } from '@/components/ui'

interface BusinessEvent {
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

// Business Feed (Platform Polish Phase 5, docs/PLATFORM_POLISH_PLAN.md §7.2)
// — the first-class, paginated version of Studio's "Zuri Noticed" card,
// reading the same business_events table via GET /api/business-feed.
export default function BusinessFeedPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [events, setEvents] = useState<BusinessEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (before?: string) => {
    if (!token) return
    try {
      const qs = before ? `?cursor=${encodeURIComponent(before)}` : ''
      const data = await apiClient<{ events: BusinessEvent[]; nextCursor: string | null }>(
        `/api/business-feed${qs}`, { token },
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
    if (token) load()
  }, [token, load])

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Business Feed" description="Everything Zuri has noticed about your business" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-2xl mx-auto space-y-2">
            {Array.from({ length: 6 }, (_, i) => <SkeletonListItem key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Business Feed" description="Everything Zuri has noticed about your business" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {error ? (
          <div className="max-w-2xl mx-auto">
            <EmptyState icon={<AlertTriangle className="w-10 h-10 text-amber-400" />} title="Couldn't load the feed" description="Make sure the API server is running." />
          </div>
        ) : events.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <EmptyState
              icon={<Sparkles className="w-10 h-10 text-gray-400" />}
              title="Nothing yet"
              description="As Zuri detects new products, invoices paid, milestones crossed, and more, they'll show up here."
            />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
            {events.map(ev => {
              const label = businessEventLabel(ev.eventType)
              const detail = businessEventDetail(ev.payload, ev.contactName)
              return (
                <div key={ev.id} className="flex items-start gap-3 border-b border-gray-50 px-4 py-3.5 last:border-b-0 hover:bg-gray-50/80">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {label}{detail ? `: ${detail}` : ''}
                    </p>
                    {ev.evidence.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{ev.evidence[0]}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {ev.confidence != null && (
                        <span className="text-[10px] font-semibold text-gray-400">
                          {Math.round(ev.confidence * 100)}% confident
                        </span>
                      )}
                      {ev.status === 'bundled' && <Badge variant="purple">In pending bundle</Badge>}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 mt-1">
                    {new Date(ev.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
            {cursor && (
              <div className="p-3">
                <button
                  onClick={() => { setLoadingMore(true); load(cursor) }}
                  disabled={loadingMore}
                  className="w-full rounded-2xl bg-slate-50 text-slate-600 text-xs font-semibold py-2.5 hover:bg-slate-100 transition-colors disabled:opacity-50"
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
