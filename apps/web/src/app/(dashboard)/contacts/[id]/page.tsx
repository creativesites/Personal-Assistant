'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, Badge, HealthBar, PageHeader, SkeletonCard, Tabs } from '@/components/ui'

interface ContactDetail {
  id: string
  name: string
  phone?: string
  avatarUrl: string | null
  lastMessageAt: string | null
  tags?: string[]
  leadScore?: number
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
    lastInteractionAt: string | null
  }
  profile: {
    personalitySummary: string
    moodBaseline: string
    communicationStyle?: string
    interests?: string[]
    painPoints?: string[]
  } | null
  insights?: Array<{
    id: string
    type: string
    content: string
    createdAt: string
  }>
}

interface Message {
  id: string
  senderType: 'user' | 'contact'
  body: string | null
  timestamp: string
}

function formatDate(ts: string | null) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const HEALTH_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal']
const TREND_CONFIG = {
  improving: { label: '↑ Improving', class: 'text-green-600 bg-green-50 border-green-100' },
  stable:    { label: '→ Stable',    class: 'text-gray-500 bg-gray-50 border-gray-100' },
  declining: { label: '↓ Declining', class: 'text-red-600 bg-red-50 border-red-100' },
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const [activeTab, setActiveTab] = useState('overview')

  const { data: contactData, loading } = useApi<{ contact: ContactDetail }>(`/api/contacts/${id}`, token)
  const { data: messagesData, loading: loadingMsgs } = useApi<{ messages: Message[] }>(
    activeTab === 'messages' ? `/api/contacts/${id}/messages` : null,
    token,
  )

  const contact = contactData?.contact
  const messages = messagesData?.messages ?? []

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'messages', label: 'Messages' },
    ...(mode !== 'personal' ? [{ id: 'notes', label: 'AI Notes' }] : []),
  ]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Contact" breadcrumbs={[{ label: 'Contacts', href: '/contacts' }]} />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Contact" breadcrumbs={[{ label: 'Contacts', href: '/contacts' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">😕</div>
            <p className="text-sm font-medium text-gray-900">Contact not found</p>
            <Link href="/contacts" className="text-xs text-indigo-600 hover:underline mt-1 block">
              Back to contacts
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const trend = TREND_CONFIG[contact.relationship.healthTrend] ?? TREND_CONFIG.stable

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={contact.name}
        breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: contact.name }]}
        action={
          <Link
            href="/inbox"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <span>💬</span>
            Message
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Profile header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-5">
          <div className="max-w-2xl mx-auto flex items-start gap-4">
            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{contact.name}</h2>
                  {contact.phone && <p className="text-sm text-gray-500 mt-0.5">{contact.phone}</p>}
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    {contact.relationship.type.replace(/_/g, ' ')}
                    {HEALTH_LABELS[contact.relationship.importanceTier] && ` · ${HEALTH_LABELS[contact.relationship.importanceTier]}`}
                  </p>
                </div>
                {mode !== 'personal' && contact.leadScore !== undefined && (
                  <div className="text-center">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold ${
                      contact.leadScore >= 70 ? 'bg-green-100 text-green-700' :
                      contact.leadScore >= 40 ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {contact.leadScore}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 font-medium">Lead score</p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {contact.tags.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">{tag}</span>
                  ))}
                </div>
              )}

              {/* Health */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Relationship health</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${trend.class}`}>{trend.label}</span>
                </div>
                <HealthBar score={contact.relationship.healthScore} showLabel />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 flex-shrink-0">
          <div className="max-w-2xl mx-auto">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="underline" />
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4 md:p-6 max-w-2xl mx-auto w-full space-y-4">

          {activeTab === 'overview' && (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">Last interaction</p>
                  <p className="text-sm font-semibold text-gray-900">{formatDate(contact.relationship.lastInteractionAt)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">Health score</p>
                  <p className="text-sm font-semibold text-gray-900">{contact.relationship.healthScore}/100</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">Priority tier</p>
                  <p className="text-sm font-semibold text-gray-900">{HEALTH_LABELS[contact.relationship.importanceTier] || '—'}</p>
                </div>
              </div>

              {/* Personality summary */}
              {contact.profile?.personalitySummary && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AI Profile</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.personalitySummary}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {contact.profile.moodBaseline && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Mood Baseline</p>
                        <Badge variant="info" className="capitalize">{contact.profile.moodBaseline}</Badge>
                      </div>
                    )}
                    {contact.profile.communicationStyle && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Communication</p>
                        <Badge variant="default" className="capitalize">{contact.profile.communicationStyle}</Badge>
                      </div>
                    )}
                  </div>
                  {contact.profile.interests && contact.profile.interests.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Interests</p>
                      <div className="flex flex-wrap gap-1.5">
                        {contact.profile.interests.map(i => (
                          <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">{i}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recent insights */}
              {contact.insights && contact.insights.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Insights</p>
                  <div className="space-y-3">
                    {contact.insights.slice(0, 5).map(insight => (
                      <div key={insight.id} className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 leading-relaxed">{insight.content}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(insight.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'messages' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loadingMsgs ? (
                <div className="p-8 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-400">No messages yet</p>
                </div>
              ) : (
                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderType === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.senderType === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-900 rounded-bl-md'
                      }`}>
                        <p>{msg.body || '(media)'}</p>
                        <p className={`text-[10px] mt-1 ${msg.senderType === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                          {timeAgo(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AI-Generated Notes</p>
              {contact.profile ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">Summary</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.personalitySummary}</p>
                  </div>
                  {contact.profile.painPoints && contact.profile.painPoints.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Pain Points</p>
                      <ul className="space-y-1.5">
                        {contact.profile.painPoints.map((p, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">AI notes will appear as Zuri analyses more conversations with {contact.name}.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
