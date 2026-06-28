'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Phone,
  Star,
  Activity,
  ChevronRight,
  Zap,
  ShieldCheck,
  Clock,
  Heart,
  BarChart3,
  User,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, Badge, HealthBar, SkeletonCard } from '@/components/ui'

interface ContactDetail {
  id: string
  name: string
  phoneNumber?: string
  avatarUrl: string | null
  lastMessageAt: string | null
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
    lastInteractionAt: string | null
    notes: string | null
  }
  profile: {
    personalitySummary: string
    communicationStyle: string | null
    emotionalPatterns: string | null
    knownTriggers: string | null
    currentLifeContext: string | null
    moodBaseline: string | null
    updatedAt: string | null
  } | null
  insights: Array<{
    key: string
    value: string
    confidence: number
    supportingText: string | null
    createdAt: string
  }>
  healthHistory: Array<{
    score: number
    previousScore: number
    changeReason: string | null
    factors: any
    recordedAt: string
  }>
  stats: {
    totalMessages: number
    sent: number
    received: number
  }
}

type TabId = 'overview' | 'intelligence' | 'timeline' | 'messages'

function formatDate(ts: string | null) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const TREND = {
  improving: { Icon: TrendingUp,   cls: 'text-green-600', bg: 'bg-green-50 border-green-100', label: 'Improving' },
  stable:    { Icon: Minus,        cls: 'text-gray-500',  bg: 'bg-gray-50 border-gray-100',   label: 'Stable'    },
  declining: { Icon: TrendingDown, cls: 'text-red-500',   bg: 'bg-red-50 border-red-100',     label: 'Declining' },
}

const TIER_LABEL = ['', 'VIP', 'Key contact', 'Regular', 'Low priority', 'Minimal']
const TIER_ICON = [null, Star, Zap, User, Clock, Minus]

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = score >= 70 ? 'text-green-700 bg-green-100 border-green-200' : score >= 40 ? 'text-amber-700 bg-amber-100 border-amber-200' : 'text-red-600 bg-red-100 border-red-200'
  const sz = size === 'lg' ? 'text-2xl font-bold w-16 h-16' : size === 'md' ? 'text-lg font-bold w-12 h-12' : 'text-sm font-bold w-9 h-9'
  return (
    <div className={`rounded-xl flex items-center justify-center border ${color} ${sz}`}>{score}</div>
  )
}

function SectionCard({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        {icon && <span className="text-gray-400">{icon}</span>}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function HealthRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const offset = circ - (pct / 100) * circ
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626'
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold text-gray-900 leading-none">{score}</p>
        <p className="text-[10px] text-gray-400 leading-none mt-0.5">health</p>
      </div>
    </div>
  )
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'hybrid'
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const { data: contactData, loading } = useApi<{ contact: ContactDetail }>(`/api/contacts/${id}`, token)

  const contact = contactData?.contact

  const tabs: { id: TabId; label: string; show?: boolean }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'intelligence',  label: 'AI Intelligence', show: mode !== 'personal' },
    { id: 'timeline',      label: 'Health History' },
    { id: 'messages',      label: 'Messages' },
  ]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <div className="h-6 w-40 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-3xl mx-auto w-full">
          <div className="h-36 bg-gray-200 rounded-xl animate-pulse" />
          <SkeletonCard /> <SkeletonCard />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          <Link href="/contacts" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
            <ChevronRight size={14} className="rotate-180" /> Contacts
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-sm font-medium text-gray-900">Contact not found</p>
            <Link href="/contacts" className="text-xs text-indigo-600 hover:underline mt-1 block">Back to contacts</Link>
          </div>
        </div>
      </div>
    )
  }

  const trend = TREND[contact.relationship.healthTrend] ?? TREND.stable
  const TrendIcon = trend.Icon
  const TierIcon = TIER_ICON[contact.relationship.importanceTier] ?? User
  const tierLabel = TIER_LABEL[contact.relationship.importanceTier] ?? 'Contact'

  const responseRatio = contact.stats.totalMessages > 0
    ? Math.round((contact.stats.received / contact.stats.totalMessages) * 100)
    : 0

  // Group insights by key type for AI intelligence tab
  const buyingSignals = contact.insights.filter(i =>
    ['buying_signal', 'purchase_intent', 'interest', 'opportunity'].includes(i.key)
  )
  const personalityInsights = contact.insights.filter(i =>
    ['personality', 'communication_style', 'preference', 'behavior'].includes(i.key)
  )
  const otherInsights = contact.insights.filter(i =>
    !buyingSignals.find(b => b.key === i.key) && !personalityInsights.find(p => p.key === i.key)
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3">
        <Link href="/contacts" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronRight size={18} className="rotate-180" />
        </Link>
        <span className="text-xs text-gray-400 hidden sm:inline">Contacts</span>
        <ChevronRight size={14} className="text-gray-300 hidden sm:inline" />
        <span className="text-sm font-medium text-gray-900 truncate">{contact.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {contact.phoneNumber && (
            <a
              href={`tel:${contact.phoneNumber}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Phone size={14} /> Call
            </a>
          )}
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <MessageSquare size={14} /> Message
          </Link>
        </div>
      </div>

      {/* Hero card */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-start gap-4">
          <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">{contact.name}</h1>
                {contact.phoneNumber && (
                  <p className="text-sm text-gray-500 mt-0.5">{contact.phoneNumber}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 capitalize">
                    <TierIcon size={12} className="text-indigo-500" />
                    {tierLabel}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500 capitalize">{contact.relationship.type.replace(/_/g, ' ')}</span>
                  {contact.relationship.lastInteractionAt && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-400">Last contact {timeAgo(contact.relationship.lastInteractionAt)}</span>
                    </>
                  )}
                </div>
              </div>
              <HealthRing score={contact.relationship.healthScore} />
            </div>

            {/* Health trend */}
            <div className="mt-3 flex items-center gap-2">
              <HealthBar score={contact.relationship.healthScore} showLabel size="sm" className="flex-1 max-w-xs" />
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${trend.bg} ${trend.cls}`}>
                <TrendIcon size={11} /> {trend.label}
              </span>
            </div>

            {/* Quick stats row */}
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">{contact.stats.totalMessages.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 leading-tight">messages</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">{contact.stats.sent.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 leading-tight">sent</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">{contact.stats.received.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 leading-tight">received</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">{responseRatio}%</p>
                <p className="text-[10px] text-gray-400 leading-tight">from them</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 overflow-x-auto">
        <div className="max-w-3xl mx-auto flex gap-0">
          {tabs.filter(t => t.show !== false).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <>
              {/* AI Summary */}
              {contact.profile?.personalitySummary && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain size={16} className="text-indigo-600" />
                    <p className="text-sm font-semibold text-indigo-900">AI Summary</p>
                    {contact.profile.updatedAt && (
                      <span className="ml-auto text-[10px] text-indigo-400">Updated {timeAgo(contact.profile.updatedAt)}</span>
                    )}
                  </div>
                  <p className="text-sm text-indigo-900 leading-relaxed">{contact.profile.personalitySummary}</p>

                  {/* Profile chips */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {contact.profile.moodBaseline && (
                      <span className="inline-flex items-center gap-1 text-xs bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                        <Heart size={10} /> {contact.profile.moodBaseline}
                      </span>
                    )}
                    {contact.profile.communicationStyle && (
                      <span className="inline-flex items-center gap-1 text-xs bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                        <MessageSquare size={10} /> {contact.profile.communicationStyle}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Personality deep-dive */}
              {(contact.profile?.emotionalPatterns || contact.profile?.knownTriggers || contact.profile?.currentLifeContext) && (
                <SectionCard title="Personality Profile" icon={<User size={14} />}>
                  <div className="space-y-4">
                    {contact.profile?.emotionalPatterns && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Emotional Patterns</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.emotionalPatterns}</p>
                      </div>
                    )}
                    {contact.profile?.knownTriggers && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Known Triggers</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.knownTriggers}</p>
                      </div>
                    )}
                    {contact.profile?.currentLifeContext && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Current Life Context</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{contact.profile.currentLifeContext}</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Notes */}
              {contact.relationship.notes && (
                <SectionCard title="Notes" icon={<Lightbulb size={14} />}>
                  <p className="text-sm text-gray-700 leading-relaxed">{contact.relationship.notes}</p>
                </SectionCard>
              )}

              {/* Recent insights (top 5) */}
              {contact.insights.length > 0 && (
                <SectionCard title="AI Memory" icon={<Brain size={14} />}>
                  <div className="space-y-3">
                    {contact.insights.slice(0, 5).map((insight, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${insight.confidence >= 0.8 ? 'bg-indigo-500' : insight.confidence >= 0.5 ? 'bg-amber-400' : 'bg-gray-300'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 leading-snug">{insight.value}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-gray-400 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                            <span className="text-gray-200">·</span>
                            <p className="text-[10px] text-gray-400">{timeAgo(insight.createdAt)}</p>
                            {insight.confidence >= 0.8 && <span className="text-[10px] text-indigo-500 font-medium">High confidence</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {contact.insights.length > 5 && (
                      <button
                        onClick={() => setActiveTab('intelligence')}
                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1"
                      >
                        View all {contact.insights.length} insights <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </SectionCard>
              )}

              {/* Empty state */}
              {!contact.profile?.personalitySummary && contact.insights.length === 0 && (
                <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                  <Brain size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">No AI data yet</p>
                  <p className="text-xs text-gray-400 mt-1">Zuri will build a profile as more conversations are analysed.</p>
                </div>
              )}
            </>
          )}

          {/* ── AI Intelligence ── */}
          {activeTab === 'intelligence' && (
            <>
              {/* Buying signals */}
              {buyingSignals.length > 0 && (
                <SectionCard title="Buying Signals & Opportunities" icon={<Zap size={14} />}>
                  <div className="space-y-3">
                    {buyingSignals.map((insight, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <Zap size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 leading-snug font-medium">{insight.value}</p>
                          {insight.supportingText && (
                            <p className="text-xs text-gray-500 mt-1 italic">"{insight.supportingText}"</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">{timeAgo(insight.createdAt)}</p>
                        </div>
                        <div className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
                          insight.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {Math.round(insight.confidence * 100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* All insights */}
              {contact.insights.length > 0 ? (
                <SectionCard title={`All Insights (${contact.insights.length})`} icon={<Sparkles size={14} />}>
                  <div className="space-y-3">
                    {contact.insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          insight.confidence >= 0.8 ? 'bg-indigo-500' : insight.confidence >= 0.5 ? 'bg-amber-400' : 'bg-gray-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-indigo-600 capitalize">{insight.key.replace(/_/g, ' ')}</p>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(insight.createdAt)}</span>
                          </div>
                          <p className="text-sm text-gray-700 leading-snug mt-0.5">{insight.value}</p>
                          {insight.supportingText && (
                            <p className="text-xs text-gray-400 mt-0.5 italic">"{insight.supportingText}"</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : (
                <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
                  <Sparkles size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">No intelligence data yet</p>
                  <p className="text-xs text-gray-400 mt-1">Insights appear as Zuri analyses conversations with {contact.name}.</p>
                </div>
              )}
            </>
          )}

          {/* ── Health History ── */}
          {activeTab === 'timeline' && (
            <>
              <SectionCard title="Relationship Health History" icon={<Activity size={14} />}>
                {contact.healthHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No health history recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {contact.healthHistory.map((h, i) => {
                      const delta = h.score - h.previousScore
                      const up = delta > 0
                      return (
                        <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            h.score >= 70 ? 'bg-green-100 text-green-700' : h.score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {h.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {up ? <ArrowUpRight size={12} /> : delta < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
                                {up ? '+' : ''}{delta}
                              </span>
                              <span className="text-xs text-gray-400">{formatDate(h.recordedAt)}</span>
                            </div>
                            {h.changeReason && (
                              <p className="text-sm text-gray-700 mt-0.5 leading-snug">{h.changeReason}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {/* ── Messages (placeholder — actual messages are in Inbox) ── */}
          {activeTab === 'messages' && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">Open the conversation in Inbox</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">
                {contact.stats.totalMessages > 0
                  ? `${contact.stats.totalMessages.toLocaleString()} messages total · ${contact.stats.sent.toLocaleString()} sent · ${contact.stats.received.toLocaleString()} received`
                  : 'No messages yet'}
              </p>
              <Link
                href="/inbox"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <MessageSquare size={14} /> Open Inbox
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
