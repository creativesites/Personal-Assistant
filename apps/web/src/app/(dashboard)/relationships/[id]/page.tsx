'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

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
    trend: string
    factors: Record<string, unknown> | null
    recordedAt: string
  }[]
  stats: { totalMessages: number; sent: number; received: number }
}

const TIER_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'] as const

function HealthBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right">{score}</span>
    </div>
  )
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

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token || !id) return
    apiClient<{ contact: ContactDetail }>(`/api/contacts/${id}`, { token })
      .then((data) => {
        setContact(data.contact)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [token, id])

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading contact...</p>
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-sm text-gray-500">Contact not found.</p>
        <button onClick={() => router.back()} className="text-sm text-indigo-600 hover:underline">
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 text-sm mr-1"
        >
          ←
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
          {contact.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">{contact.name}</p>
          {contact.phoneNumber && (
            <p className="text-xs text-gray-400">{contact.phoneNumber}</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{contact.stats.totalMessages}</p>
              <p className="text-xs text-gray-400 mt-1">Total Messages</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-indigo-600">{contact.relationship.healthScore}</p>
              <p className="text-xs text-gray-400 mt-1">Health Score</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{formatDate(contact.relationship.lastInteractionAt)}</p>
              <p className="text-xs text-gray-400 mt-1">Last Interaction</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Relationship */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Relationship</p>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Type</span>
                  <span className="text-gray-900 capitalize">{contact.relationship.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Priority</span>
                  <span className="text-gray-900">{TIER_LABELS[contact.relationship.importanceTier] || '—'}</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Health</span>
                    <span className={`text-xs ${
                      contact.relationship.healthTrend === 'improving' ? 'text-green-600'
                      : contact.relationship.healthTrend === 'declining' ? 'text-red-500'
                      : 'text-gray-400'
                    }`}>{contact.relationship.healthTrend}</span>
                  </div>
                  <HealthBar score={contact.relationship.healthScore} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Messages</span>
                  <span className="text-gray-900">{contact.stats.sent} sent · {contact.stats.received} received</span>
                </div>
                {contact.relationship.notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{contact.relationship.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Profile */}
            {contact.profile ? (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">AI Profile</p>
                  <span className="text-xs text-gray-400">Updated {formatDate(contact.profile.updatedAt)}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Personality</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.personalitySummary}</p>
                  </div>
                  {contact.profile.communicationStyle && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Communication Style</p>
                      <p className="text-sm text-gray-700">{contact.profile.communicationStyle}</p>
                    </div>
                  )}
                  {contact.profile.currentLifeContext && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Current Context</p>
                      <p className="text-sm text-gray-700">{contact.profile.currentLifeContext}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-gray-400">Mood baseline:</span>
                    <span className="text-gray-700 capitalize">{contact.profile.moodBaseline}</span>
                  </div>
                  {contact.profile.knownTriggers && contact.profile.knownTriggers.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Known Triggers</p>
                      <div className="flex flex-wrap gap-1">
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
              <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center">
                <p className="text-sm text-gray-400 text-center">
                  AI profile not yet generated.<br />
                  <span className="text-xs">Builds automatically after more messages.</span>
                </p>
              </div>
            )}
          </div>

          {/* Insights */}
          {contact.insights.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
                AI Insights ({contact.insights.length})
              </p>
              <div className="space-y-3">
                {contact.insights.map((insight, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="text-xs font-medium text-gray-500 capitalize">
                          {insight.key.replace(/_/g, ' ')}
                        </p>
                        <span className="text-xs text-gray-300">{Math.round(insight.confidence * 100)}%</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5">{insight.value}</p>
                      {insight.supportingText && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Health History */}
          {contact.healthHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Health History</p>
              <div className="space-y-2">
                {contact.healthHistory.map((h, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-24 shrink-0">{formatDate(h.recordedAt)}</span>
                    <div className="flex-1">
                      <HealthBar score={h.score} />
                    </div>
                    <span className={`text-xs w-16 text-right shrink-0 ${
                      h.trend === 'improving' ? 'text-green-600'
                      : h.trend === 'declining' ? 'text-red-500'
                      : 'text-gray-400'
                    }`}>{h.trend}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
