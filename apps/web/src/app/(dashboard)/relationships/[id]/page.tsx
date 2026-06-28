'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, HealthBar, Badge, Tabs, StatCard, EmptyState } from '@/components/ui'

interface RelationshipClock {
  id: string
  clockType: string
  avgDaysBetweenMessages: number | null
  stdDevDays: number | null
  isActive: boolean
  isManuallyConfigured: boolean
  checkIntervalDays: number
  lastNudgeAt: string | null
  nextCheckAt: string | null
  nudgeCount: number
}

interface ContactDetail {
  id: string
  name: string
  avatarUrl: string | null
  phoneNumber: string | null
  lastMessageAt: string | null
  relationship: {
    type: string
    importanceTier: number
    healthScore: number
    healthTrend: string
    lastInteractionAt: string | null
    notes: string | null
  }
  profile: {
    personalitySummary: string
    communicationStyle: string | null
    emotionalPatterns: { primary_emotions?: string[]; emotional_triggers?: string[]; coping_style?: string } | null
    knownTriggers: string[] | null
    currentLifeContext: string | null
    moodBaseline: string
    updatedAt: string
  } | null
  insights: {
    key: string
    value: string
    confidence: number
    supportingText: string
    createdAt: string
  }[]
  healthHistory: {
    score: number
    previousScore: number | null
    changeReason: string | null
    factors: Record<string, unknown> | null
    recordedAt: string
  }[]
  stats: { totalMessages: number; sent: number; received: number }
}

const TIER_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'] as const

const TREND: Record<string, { variant: 'success' | 'error' | 'default'; label: string }> = {
  improving: { variant: 'success', label: '↑ Improving' },
  declining:  { variant: 'error',   label: '↓ Declining'  },
  stable:     { variant: 'default', label: '→ Stable'     },
}

function formatDate(ts: string | null) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

const CLOCK_LABELS: Record<string, string> = {
  dormancy_watch: 'Dormancy Watch',
  weekly_touchpoint: 'Weekly Touchpoint',
  daily_checkin: 'Daily Check-in',
  post_event_followup: 'Post-event Follow-up',
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [clocks, setClocks] = useState<RelationshipClock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [togglingClock, setTogglingClock] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !id) return
    Promise.all([
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${id}`, { token }),
      apiClient<{ clocks: RelationshipClock[] }>(`/api/contacts/${id}/clock`, { token }),
    ])
      .then(([contactData, clockData]) => {
        setContact(contactData.contact)
        setClocks(clockData.clocks)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [token, id])

  const toggleClock = async (clockType: string, currentActive: boolean) => {
    if (!token) return
    setTogglingClock(clockType)
    await apiClient(`/api/contacts/${id}/clock/${clockType}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ isActive: !currentActive }),
    })
    setClocks((prev) => prev.map((c) =>
      c.clockType === clockType ? { ...c, isActive: !currentActive, isManuallyConfigured: true } : c,
    ))
    setTogglingClock(null)
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading contact...</p>
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon="👤"
          title="Contact not found"
          action={
            <button onClick={() => router.back()} className="text-sm text-indigo-600 hover:underline">
              Go back
            </button>
          }
        />
      </div>
    )
  }

  const trend = TREND[contact.relationship.healthTrend] ?? TREND.stable

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'insights',  label: 'Insights', badge: contact.insights.length || undefined },
    { id: 'history',   label: 'History',  badge: contact.healthHistory.length || undefined },
    { id: 'clocks',    label: 'Clocks',   badge: clocks.length || undefined },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="p-1.5 -ml-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Go back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm truncate">{contact.name}</p>
          {contact.phoneNumber && (
            <p className="text-xs text-gray-400 leading-tight">{contact.phoneNumber}</p>
          )}
        </div>
        <Badge variant={trend.variant}>{trend.label}</Badge>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Top stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Messages"
              value={contact.stats.totalMessages.toLocaleString()}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              }
            />
            <StatCard
              label="Health Score"
              value={contact.relationship.healthScore}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              }
            />
            <StatCard
              label="Last Contact"
              value={formatDate(contact.relationship.lastInteractionAt)}
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>

          {/* Tabs */}
          <Tabs tabs={tabs} defaultTab="overview">
            {(activeTab) => (
              <div className="pt-4 space-y-4">

                {/* ── Overview ── */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Relationship */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Relationship</p>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Type</span>
                          <span className="text-gray-900 capitalize">{contact.relationship.type.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Priority</span>
                          <span className="text-gray-900">{TIER_LABELS[contact.relationship.importanceTier] || '—'}</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Health</span>
                            <Badge variant={trend.variant}>{trend.label}</Badge>
                          </div>
                          <HealthBar score={contact.relationship.healthScore} showLabel />
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">Messages</span>
                          <span className="text-gray-900 tabular-nums">
                            {contact.stats.sent} sent · {contact.stats.received} received
                          </span>
                        </div>
                        {contact.relationship.notes && (
                          <div className="pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-1">Notes</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{contact.relationship.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI Profile */}
                    {contact.profile ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Profile</p>
                          <span className="text-xs text-gray-400">Updated {formatDate(contact.profile.updatedAt)}</span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Personality</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.personalitySummary}</p>
                          </div>
                          {contact.profile.communicationStyle && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Communication</p>
                              <p className="text-sm text-gray-700">{contact.profile.communicationStyle}</p>
                            </div>
                          )}
                          {contact.profile.currentLifeContext && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Current Context</p>
                              <p className="text-sm text-gray-700">{contact.profile.currentLifeContext}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400">Mood baseline:</span>
                            <span className="text-gray-700 capitalize">{contact.profile.moodBaseline}</span>
                          </div>
                          {contact.profile.knownTriggers && contact.profile.knownTriggers.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1.5">Known Triggers</p>
                              <div className="flex flex-wrap gap-1.5">
                                {contact.profile.knownTriggers.map((t, i) => (
                                  <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-center">
                        <EmptyState
                          icon="🤖"
                          title="No AI profile yet"
                          description="Builds automatically after more messages are exchanged."
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── Insights ── */}
                {activeTab === 'insights' && (
                  contact.insights.length === 0 ? (
                    <EmptyState
                      icon="💡"
                      title="No insights yet"
                      description="AI insights accumulate as the conversation history grows."
                    />
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                      {contact.insights.map((insight, i) => (
                        <div key={i} className="flex gap-3 items-start p-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide capitalize">
                                {insight.key.replace(/_/g, ' ')}
                              </p>
                              <span className="text-xs text-gray-300 tabular-nums">
                                {Math.round(insight.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="text-sm text-gray-800">{insight.value}</p>
                            {insight.supportingText && (
                              <p className="text-xs text-gray-400 mt-1 italic">"{insight.supportingText}"</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* ── History ── */}
                {activeTab === 'history' && (
                  contact.healthHistory.length === 0 ? (
                    <EmptyState
                      icon="📈"
                      title="No health history"
                      description="Health scores are logged automatically as the relationship evolves."
                    />
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                        Health over time
                      </p>
                      <div className="space-y-3">
                        {contact.healthHistory.map((h, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 w-24 shrink-0 tabular-nums">
                              {formatDate(h.recordedAt)}
                            </span>
                            <div className="flex-1">
                              <HealthBar score={h.score} showLabel />
                            </div>
                            {h.previousScore != null && h.score !== h.previousScore && (
                              <span className={`text-xs font-medium tabular-nums shrink-0 ${h.score > h.previousScore ? 'text-green-600' : 'text-red-500'}`}>
                                {h.score > h.previousScore ? '+' : ''}{h.score - h.previousScore}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {/* ── Clocks ── */}
                {activeTab === 'clocks' && (
                  clocks.length === 0 ? (
                    <EmptyState
                      icon="⏰"
                      title="No relationship clocks"
                      description="Clocks are set up automatically as the temporal intelligence engine learns your cadence."
                    />
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Relationship Clocks</p>
                        <p className="text-xs text-gray-400 mt-0.5">AI-learned timing for proactive suggestions.</p>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {clocks.map((clock) => (
                          <div key={clock.id} className="flex items-start gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium text-gray-800">
                                  {CLOCK_LABELS[clock.clockType] || clock.clockType}
                                </p>
                                {clock.isManuallyConfigured && (
                                  <Badge variant="info">manual</Badge>
                                )}
                              </div>
                              {clock.avgDaysBetweenMessages != null && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Typical cadence: every {Math.round(clock.avgDaysBetweenMessages)} days
                                  {clock.stdDevDays != null && ` ±${Math.round(clock.stdDevDays)}d`}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">
                                Checks every {clock.checkIntervalDays} days
                                {clock.nudgeCount > 0 && ` · ${clock.nudgeCount} nudge${clock.nudgeCount !== 1 ? 's' : ''}`}
                                {clock.lastNudgeAt && ` · last ${formatDate(clock.lastNudgeAt)}`}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleClock(clock.clockType, clock.isActive)}
                              disabled={togglingClock === clock.clockType}
                              className={`text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50 ${
                                clock.isActive
                                  ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600'
                                  : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700'
                              }`}
                            >
                              {clock.isActive ? 'Active' : 'Paused'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}

              </div>
            )}
          </Tabs>

        </div>
      </div>
    </div>
  )
}
