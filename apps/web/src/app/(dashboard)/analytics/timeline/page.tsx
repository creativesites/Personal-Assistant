'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SUB_NAV = [
  { href: '/analytics', label: 'Executive' },
  { href: '/analytics/sales', label: 'Sales' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/conversations', label: 'Conversations' },
  { href: '/analytics/operations', label: 'Operations' },
  { href: '/analytics/opportunities', label: 'Opportunities' },
  { href: '/analytics/predictions', label: 'Predictions' },
  { href: '/analytics/health', label: 'Health Score' },
  { href: '/analytics/roi', label: 'ROI' },
  { href: '/analytics/timeline', label: 'Timeline' },
  { href: '/analytics/reports', label: 'Reports' },
]

function AnalyticsSubNav() {
  const pathname = usePathname()
  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white">
      <div className="flex min-w-max px-4 md:px-6">
        {SUB_NAV.map(item => {
          const active = item.href === '/analytics' ? pathname === '/analytics' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

type EventType = 'new_contact' | 'birthday' | 'meeting' | 'key_conversation' | 'other'

interface TimelineEvent {
  id: string
  type: EventType
  title: string
  description: string
  date: string
  contactId?: string
  contactName?: string
}

interface TimelineData {
  events: TimelineEvent[]
}

const TYPE_CONFIG: Record<EventType, { label: string; dotColor: string; badgeBg: string; badgeText: string }> = {
  new_contact: {
    label: 'New Contact',
    dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
  },
  birthday: {
    label: 'Birthday',
    dotColor: 'bg-pink-500',
    badgeBg: 'bg-pink-100',
    badgeText: 'text-pink-700',
  },
  meeting: {
    label: 'Meeting',
    dotColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-700',
  },
  key_conversation: {
    label: 'Key Conversation',
    dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
  },
  other: {
    label: 'Event',
    dotColor: 'bg-gray-400',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-600',
  },
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function SkeletonTimeline() {
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-8 pl-12">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="relative">
            <div className="absolute -left-8 top-1 w-4 h-4 rounded-full bg-gray-200 animate-pulse" />
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
                <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
              </div>
              <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TimelinePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [data, setData] = useState<TimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await apiClient('/api/analytics/timeline', { token: token ?? undefined })
        setData(res as TimelineData)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load timeline'
        setError(msg)
        setData({ events: [] })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const events = data?.events ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      {/* Page header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 md:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Business Timeline</h1>
          <p className="mt-1 text-sm text-gray-500">Every important event in your business</p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-3xl mx-auto">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <SkeletonTimeline />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4">📅</span>
            <p className="text-gray-500 text-base">Your business timeline will appear here as events are detected</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200" />

            <div className="space-y-6 pl-12">
              {events.map((event) => {
                const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.other
                return (
                  <div key={event.id} className="relative">
                    {/* Dot on the line */}
                    <div
                      className={`absolute -left-8 top-5 w-4 h-4 rounded-full border-2 border-white shadow ${cfg.dotColor}`}
                    />

                    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
                      {/* Date + badge row */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-sm text-gray-500 font-medium">{formatDate(event.date)}</span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}
                        >
                          {cfg.label}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-base font-semibold text-gray-900 mb-1">{event.title}</h3>

                      {/* Description */}
                      {event.description && (
                        <p className="text-sm text-gray-700 mb-3 leading-relaxed">{event.description}</p>
                      )}

                      {/* Contact link */}
                      {event.contactId && event.contactName && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                          <Link
                            href={`/contacts/${event.contactId}`}
                            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:underline transition-colors"
                          >
                            {event.contactName}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
