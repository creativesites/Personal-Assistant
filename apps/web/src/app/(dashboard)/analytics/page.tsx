'use client'

import { useMemo, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { EmptyState, PageHeader, SkeletonCard, StatCard } from '@/components/ui'

type Range = '7d' | '30d' | '90d'

interface AnalyticsData {
  messagesSent: number
  messagesReceived: number
  activeConversations: number
  avgResponseTimeMin: number
  avgHealthScore: number
  suggestionsGenerated: number
  suggestionsApproved: number
  contactsTracked: number
  topContacts: Array<{ id: string; name: string; messageCount: number; avatarUrl: string | null }>
  healthDistribution: { critical: number; low: number; medium: number; high: number; excellent: number }
  dailyMessages: Array<{ date: string; sent: number; received: number }>
}

interface ConversationContact {
  id: string
  name: string
  avatarUrl: string | null
}

interface Conversation {
  id: string
  contact: ConversationContact
  unreadCount: number
  lastMessageAt: string | null
}

interface Contact {
  id: string
  name: string
  avatarUrl: string | null
  lastMessageAt: string | null
  relationship: { healthScore: number; healthTrend: string }
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  )
}

function HealthDistBar({ label, count, total, color, bg }: { label: string; count: number; total: number; color: string; bg: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[10px] font-semibold w-16 shrink-0 ${color}`}>{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bg} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{count}</span>
    </div>
  )
}

export default function AnalyticsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const [range, setRange] = useState<Range>('30d')

  const { data: convData, loading: loadingConv } = useApi<{ conversations: Conversation[] }>('/api/conversations', token)
  const { data: contactData, loading: loadingContacts } = useApi<{ contacts: Contact[] }>('/api/contacts', token)
  const { data: analyticsData, loading: loadingAnalytics } = useApi<AnalyticsData>('/api/analytics', token)

  const loading = loadingConv || loadingContacts || loadingAnalytics

  const contacts = contactData?.contacts ?? []
  const conversations = convData?.conversations ?? []

  const stats = useMemo(() => {
    if (!contacts.length && !conversations.length && !analyticsData) return null

    const healthDist = { critical: 0, low: 0, medium: 0, high: 0, excellent: 0 }
    contacts.forEach(c => {
      const s = c.relationship.healthScore
      if (s < 20)      healthDist.critical++
      else if (s < 40) healthDist.low++
      else if (s < 60) healthDist.medium++
      else if (s < 80) healthDist.high++
      else             healthDist.excellent++
    })

    const avgHealth = contacts.length > 0
      ? Math.round(contacts.reduce((s, c) => s + c.relationship.healthScore, 0) / contacts.length)
      : analyticsData?.avgHealthScore ?? 0

    return {
      messagesSent:     analyticsData?.messagesSent ?? 0,
      messagesReceived: analyticsData?.messagesReceived ?? 0,
      suggestionsApproved: analyticsData?.suggestionsApproved ?? 0,
      suggestionsGenerated: analyticsData?.suggestionsGenerated ?? 0,
      activeConversations: conversations.length || analyticsData?.activeConversations || 0,
      contactsTracked: contacts.length || analyticsData?.contactsTracked || 0,
      avgHealth,
      avgResponseTimeMin: analyticsData?.avgResponseTimeMin ?? 0,
      healthDist,
    }
  }, [contacts, conversations, analyticsData])

  const RANGES: { key: Range; label: string }[] = [
    { key: '7d',  label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
  ]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Analytics" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  const healthTotal = stats ? Object.values(stats.healthDist).reduce((s, v) => s + v, 0) : 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Analytics"
        action={
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  range === r.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">

          {!stats ? (
            <EmptyState
              icon="📊"
              title="No analytics yet"
              description="Analytics appear once you start using Zuri with WhatsApp connected."
            />
          ) : (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="Messages sent"
                  value={stats.messagesSent.toLocaleString()}
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                />
                <StatCard
                  label="Conversations"
                  value={stats.activeConversations.toLocaleString()}
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
                />
                <StatCard
                  label="Contacts tracked"
                  value={stats.contactsTracked.toLocaleString()}
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                />
                <StatCard
                  label="Avg health"
                  value={`${stats.avgHealth}/100`}
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>}
                />
              </div>

              {/* AI stats */}
              {(stats.suggestionsGenerated > 0 || mode !== 'personal') && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">AI Performance</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Suggestions generated</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{stats.suggestionsGenerated}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Suggestions approved</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{stats.suggestionsApproved}</span>
                    </div>
                    {stats.suggestionsGenerated > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm text-gray-600">Approval rate</span>
                          <span className="text-sm font-semibold text-indigo-600 tabular-nums">
                            {Math.round((stats.suggestionsApproved / stats.suggestionsGenerated) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((stats.suggestionsApproved / stats.suggestionsGenerated) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Message activity */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Message Activity</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-600">Sent</span>
                      <span className="text-sm font-semibold text-indigo-600 tabular-nums">{stats.messagesSent}</span>
                    </div>
                    <MiniBar pct={stats.messagesSent + stats.messagesReceived > 0 ? (stats.messagesSent / (stats.messagesSent + stats.messagesReceived)) * 100 : 0} color="bg-indigo-500" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-600">Received</span>
                      <span className="text-sm font-semibold text-gray-700 tabular-nums">{stats.messagesReceived}</span>
                    </div>
                    <MiniBar pct={stats.messagesSent + stats.messagesReceived > 0 ? (stats.messagesReceived / (stats.messagesSent + stats.messagesReceived)) * 100 : 0} color="bg-gray-400" />
                  </div>
                  {stats.avgResponseTimeMin > 0 && (
                    <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                      <span className="text-sm text-gray-500">Avg response time</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">
                        {stats.avgResponseTimeMin < 60
                          ? `${stats.avgResponseTimeMin}m`
                          : `${Math.round(stats.avgResponseTimeMin / 60)}h`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Health distribution */}
              {healthTotal > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Relationship Health Distribution</p>
                  <div className="space-y-2.5">
                    <HealthDistBar label="Excellent" count={stats.healthDist.excellent} total={healthTotal} color="text-green-600"  bg="bg-green-500" />
                    <HealthDistBar label="High"      count={stats.healthDist.high}      total={healthTotal} color="text-lime-600"   bg="bg-lime-400" />
                    <HealthDistBar label="Medium"    count={stats.healthDist.medium}    total={healthTotal} color="text-amber-600"  bg="bg-amber-400" />
                    <HealthDistBar label="Low"       count={stats.healthDist.low}       total={healthTotal} color="text-orange-600" bg="bg-orange-400" />
                    <HealthDistBar label="Critical"  count={stats.healthDist.critical}  total={healthTotal} color="text-red-600"    bg="bg-red-500" />
                  </div>
                </div>
              )}

              {/* Note on data freshness */}
              <p className="text-xs text-gray-400 text-center pb-2">
                Analytics update in real-time as Zuri processes your conversations.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
