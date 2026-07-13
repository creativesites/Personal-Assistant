'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MessageSquare,
  Inbox,
  Users,
  Zap,
  Heart,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  Settings,
  Brain,
  Flame,
  ChevronRight,
  Smartphone,
  ArrowRight,
  Send,
  Radio,
  Calendar,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, StatCard, useToast } from '@/components/ui'

interface Conversation {
  id: string
  contact: { id: string; name: string; avatarUrl: string | null }
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  healthScore: number
}

interface Contact {
  id: string
  name: string
  avatarUrl: string | null
  relationship: { healthScore: number; healthTrend: string; importanceTier: number }
}

interface ProactiveSuggestion {
  id: string
  title: string
  priority: number
  draftMessage: string | null
  contact: { id: string; name: string; avatarUrl: string | null }
}

interface MarketingSummary {
  postsSent: number
  totalLeads: number
  totalSales: number
  topProduct: string | null
}

// AI Daily Brief (docs/RELATIONSHIP_OS_PLAN.md §5.3/§6.2) — a rendering
// layer over proactive_queue/opportunities/relationships, not a new
// detector. Every item already reads as a complete sentence fragment from
// the API (headline), so the frontend just bolds the contact name and
// appends detail/amount — no client-side composition logic needed.
interface BriefItem {
  id: string
  sourceType: 'suggestion' | 'opportunity' | 'health_decline' | 'event'
  headline: string
  detail: string | null
  amountCents: number | null
  contact: { id: string; name: string; avatarUrl: string | null }
}

interface BriefData {
  items: BriefItem[]
  revenueAtRisk: { contactCount: number; cents: number } | null
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'ZMW' })
}

type LucideIcon = React.ComponentType<{ className?: string; size?: number | string }>

const BRIEF_STYLES: Record<BriefItem['sourceType'], { Icon: LucideIcon; iconBg: string; iconColor: string }> = {
  suggestion: { Icon: Sparkles, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
  opportunity: { Icon: TrendingUp, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  health_decline: { Icon: AlertTriangle, iconBg: 'bg-red-50', iconColor: 'text-red-600' },
  event: { Icon: Calendar, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
}

// Health Rollup (docs/RELATIONSHIP_OS_PLAN.md §5.10/§6.9) — a composite
// score across categories already computed piecemeal elsewhere; every
// sub-score is nullable (e.g. no agents configured yet → automation is
// null) rather than defaulting to 0, which would misleadingly read as bad.
interface BusinessRollup {
  sales: number | null
  relationships: number | null
  automation: number | null
  customerSatisfaction: number | null
  pipeline: number | null
  knowledge: number | null
  overall: number | null
}
interface PersonalRollup {
  closeCircleHealth: number | null
  dormantCount: number
  upcomingEventsHandled: number | null
  reciprocityBalance: number | null
  overall: number | null
}
interface HealthRollup { business: BusinessRollup; personal: PersonalRollup }

function rollupColor(score: number) {
  return score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-500'
}

function RollupStat({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  if (value === null) return null
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${rollupColor(value)}`}>{value}{suffix}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function timeAgo(ts: string | null) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function greeting(name: string | undefined) {
  const h = new Date().getHours()
  const time = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${time}, ${name.split(' ')[0]}` : time
}

function QuickAction({
  href,
  Icon,
  label,
  description,
  iconBg = 'bg-indigo-50',
  iconColor = 'text-indigo-600',
}: {
  href: string
  Icon: LucideIcon
  label: string
  description: string
  iconBg?: string
  iconColor?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className={`w-10 h-10 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center flex-shrink-0 group-hover:opacity-90 transition-opacity`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
    </Link>
  )
}

export default function DashboardPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const marketingAccess = session.data?.marketingAccess ?? 'none'
  const hasMarketingAccess = marketingAccess === 'beta' || marketingAccess === 'enabled'
  const { addToast } = useToast()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [proactive, setProactive] = useState<ProactiveSuggestion[]>([])
  const [brief, setBrief] = useState<BriefData | null>(null)
  const [rollup, setRollup] = useState<HealthRollup | null>(null)
  const [marketing, setMarketing] = useState<MarketingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')

  useEffect(() => {
    if (!token) return
    Promise.allSettled([
      apiClient<{ conversations: Conversation[] }>('/api/conversations', { token }),
      apiClient<{ contacts: Contact[] }>('/api/contacts', { token }),
      apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token }),
      apiClient<BriefData>('/api/proactive/brief', { token }),
      apiClient<HealthRollup>('/api/analytics/health-rollup', { token }),
    ]).then(([convRes, contactRes, proRes, briefRes, rollupRes]) => {
      if (convRes.status === 'fulfilled') setConversations(convRes.value.conversations)
      if (contactRes.status === 'fulfilled') setContacts(contactRes.value.contacts)
      if (proRes.status === 'fulfilled') setProactive(proRes.value.suggestions)
      if (briefRes.status === 'fulfilled') setBrief(briefRes.value)
      if (rollupRes.status === 'fulfilled') setRollup(rollupRes.value)
      setLoading(false)
    })
  }, [token])

  useEffect(() => {
    if (!token || !hasMarketingAccess) return
    apiClient<{
      summary: { postsSent: number; totalLeads: number; totalSales: number }
      products: { name: string }[]
    }>('/api/analytics/campaigns', { token })
      .then((data) => setMarketing({ ...data.summary, topProduct: data.products[0]?.name ?? null }))
      .catch(() => setMarketing(null))
  }, [token, hasMarketingAccess])

  const sendNow = async (s: ProactiveSuggestion) => {
    if (!token || !s.draftMessage) return
    setActioningId(s.id)
    try {
      await apiClient(`/api/proactive/${s.id}/send`, { method: 'POST', token })
      setProactive(prev => prev.filter(item => item.id !== s.id))
      addToast({ variant: 'success', title: 'Message sent', description: `Sent to ${s.contact.name}.` })
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Could not send message',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      })
    } finally {
      setActioningId(null)
    }
  }

  const openRegenerate = (id: string) => {
    setRegenTargetId(prev => (prev === id ? null : id))
    setInstruction('')
  }

  const regenerate = async (id: string) => {
    if (!token) return
    setRegeneratingId(id)
    try {
      const data = await apiClient<{ suggestion: {
        id: string; title: string; draftMessage: string | null; priority: number
      } }>(`/api/proactive/${id}/regenerate`, {
        method: 'POST',
        token,
        body: JSON.stringify({ instruction: instruction.trim() || undefined }),
      })
      setProactive(prev => prev.map(item => item.id === id
        ? { ...item, title: data.suggestion.title, draftMessage: data.suggestion.draftMessage, priority: data.suggestion.priority }
        : item))
      setRegenTargetId(null)
      setInstruction('')
      addToast({ variant: 'success', title: 'Draft regenerated' })
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Could not regenerate draft',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      })
    } finally {
      setRegeneratingId(null)
    }
  }

  const stats = useMemo(() => {
    const unread = conversations.reduce((s, c) => s + c.unreadCount, 0)
    const pending = conversations.filter(c => c.unreadCount > 0).length
    const avgHealth = contacts.length
      ? Math.round(contacts.reduce((s, c) => s + c.relationship.healthScore, 0) / contacts.length)
      : 0
    const needsAttention = contacts.filter(c => c.relationship.healthScore < 60 || c.relationship.healthTrend === 'declining').length
    return { unread, pending, avgHealth, needsAttention, totalContacts: contacts.length, proactiveCount: proactive.length }
  }, [conversations, contacts, proactive])

  if (session.status === 'loading') {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const businessStats = [
    { label: 'Unread messages', value: stats.unread, icon: MessageSquare, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { label: 'Active chats', value: stats.pending, icon: Inbox, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Contacts', value: stats.totalContacts, icon: Users, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
    { label: 'Pending actions', value: stats.proactiveCount, icon: Zap, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  ]

  const personalStats = [
    { label: 'Contacts', value: stats.totalContacts, icon: Users, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
    { label: 'Avg health', value: `${stats.avgHealth}`, icon: Heart, iconBg: 'bg-rose-50', iconColor: 'text-rose-500' },
    { label: 'Need attention', value: stats.needsAttention, icon: AlertTriangle, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'Pending nudges', value: stats.proactiveCount, icon: Sparkles, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
  ]

  const displayStats = mode === 'personal' ? personalStats : businessStats

  const attentionContacts = contacts
    .filter(c => c.relationship.healthScore < 60 || c.relationship.healthTrend === 'declining')
    .sort((a, b) => a.relationship.healthScore - b.relationship.healthScore)
    .slice(0, 4)

  const recentConversations = conversations
    .filter(c => c.unreadCount > 0)
    .slice(0, 5)

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Hero header */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-5 md:py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              {greeting(session.data?.user.name)}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading
                ? 'Loading your workspace…'
                : stats.unread > 0
                ? `${stats.unread} unread message${stats.unread !== 1 ? 's' : ''} · ${stats.proactiveCount} pending action${stats.proactiveCount !== 1 ? 's' : ''}`
                : 'All caught up! Your workspace is ready.'}
            </p>
          </div>
          <Link
            href="/inbox"
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-sm"
          >
            <Inbox size={15} />
            <span>Open Inbox</span>
            {stats.unread > 0 && (
              <span className="bg-white/25 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">
                {stats.unread}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-6 py-5 max-w-4xl mx-auto w-full space-y-6">

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {displayStats.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg ${s.iconBg} ${s.iconColor} flex items-center justify-center`}>
                    <Icon size={16} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</p>
              </div>
            )
          })}
        </div>

        {/* AI Daily Brief — same greeting/place every morning, real names and numbers */}
        {brief && (brief.items.length > 0 || brief.revenueAtRisk) && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 md:px-5 py-3.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} className="text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">
                  {mode === 'personal' ? "Here's who's on your mind today" : "Here's what changed overnight"}
                </h2>
                <p className="text-[11px] text-white/70">
                  {brief.items.length} item{brief.items.length !== 1 ? 's' : ''} worth a look
                </p>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {brief.items.map(item => {
                const style = BRIEF_STYLES[item.sourceType]
                const Icon = style.Icon
                return (
                  <Link
                    key={`${item.sourceType}-${item.id}`}
                    href={`/contacts/${item.contact.id}`}
                    className="flex items-start gap-3 px-4 md:px-5 py-3 hover:bg-gray-50/80 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg ${style.iconBg} ${style.iconColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        <span className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{item.contact.name}</span>{' '}
                        {item.headline}
                      </p>
                      {item.detail && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.detail}</p>}
                    </div>
                    {item.amountCents !== null && (
                      <span className="flex-shrink-0 text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-1 mt-0.5">
                        {formatCents(item.amountCents)}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            {brief.revenueAtRisk && (
              <div className="flex items-center gap-3 px-4 md:px-5 py-3 bg-red-50 border-t border-red-100">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={14} />
                </div>
                <p className="text-sm text-red-700 leading-relaxed">
                  Revenue at risk:{' '}
                  <span className="font-bold">{formatCents(brief.revenueAtRisk.cents)}</span>
                  {' '}across {brief.revenueAtRisk.contactCount} customer{brief.revenueAtRisk.contactCount !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Health Rollup — composite score across categories already computed
            piecemeal elsewhere; both shapes always fetched, shown per mode */}
        {rollup && (
          <div className="grid md:grid-cols-2 gap-4">
            {(mode === 'business' || mode === 'hybrid') && rollup.business.overall !== null && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">Business Health</h2>
                  <span className={`text-2xl font-bold tabular-nums ${rollupColor(rollup.business.overall)}`}>
                    {rollup.business.overall}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <RollupStat label="Sales" value={rollup.business.sales} />
                  <RollupStat label="Relationships" value={rollup.business.relationships} />
                  <RollupStat label="Pipeline" value={rollup.business.pipeline} />
                  <RollupStat label="Automation" value={rollup.business.automation} />
                  <RollupStat label="Satisfaction" value={rollup.business.customerSatisfaction} />
                  <RollupStat label="Knowledge" value={rollup.business.knowledge} />
                </div>
              </div>
            )}
            {(mode === 'personal' || mode === 'hybrid') && rollup.personal.overall !== null && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">Personal Health</h2>
                  <span className={`text-2xl font-bold tabular-nums ${rollupColor(rollup.personal.overall)}`}>
                    {rollup.personal.overall}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <RollupStat label="Close circle" value={rollup.personal.closeCircleHealth} />
                  <RollupStat label="Events handled" value={rollup.personal.upcomingEventsHandled} suffix="%" />
                  <RollupStat label="Reciprocity" value={rollup.personal.reciprocityBalance} />
                  <div>
                    <p className="text-lg font-bold tabular-nums text-gray-700">{rollup.personal.dormantCount}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Dormant</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hybrid: split mode overview */}
        {mode === 'hybrid' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-4">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-3">Business</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Open conversations</span>
                  <span className="font-semibold">{stats.pending}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Unread</span>
                  <span className="font-semibold">{stats.unread}</span>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-100 p-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-3">Personal</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg health</span>
                  <span className="font-semibold">{stats.avgHealth}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Need attention</span>
                  <span className={`font-semibold ${stats.needsAttention > 0 ? 'text-red-500' : ''}`}>{stats.needsAttention}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Business: recent unread conversations */}
        {(mode === 'business' || mode === 'hybrid') && recentConversations.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Needs Reply</h2>
              <Link href="/inbox" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden shadow-sm">
              {recentConversations.map(conv => (
                <Link
                  key={conv.id}
                  href="/inbox"
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80 transition-colors"
                >
                  <Avatar name={conv.contact.name} src={conv.contact.avatarUrl ?? undefined} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{conv.contact.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(conv.lastMessageAt)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessagePreview || 'No preview'}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Personal: attention needed */}
        {(mode === 'personal' || mode === 'hybrid') && attentionContacts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Needs Your Attention</h2>
              <Link href="/relationships" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {attentionContacts.map(contact => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-red-200 hover:shadow-sm transition-all"
                >
                  <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                    <HealthBar score={contact.relationship.healthScore} showLabel size="sm" className="mt-1.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Proactive queue preview */}
        {proactive.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Proactive Queue</h2>
              <Link href="/proactive" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden shadow-sm">
              {proactive.slice(0, 3).map(s => (
                <div key={s.id} className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.contact.name} src={s.contact.avatarUrl ?? undefined} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.contact.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.title}</p>
                    </div>
                    {s.priority <= 2 && <Badge variant="error" dot>Urgent</Badge>}
                  </div>

                  {regenTargetId === s.id && (
                    <div className="flex items-center gap-2 mt-2.5">
                      <input
                        type="text"
                        autoFocus
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') regenerate(s.id) }}
                        placeholder="Optional: tell Zuri what to change"
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                      />
                      <button
                        onClick={() => regenerate(s.id)}
                        disabled={regeneratingId === s.id}
                        className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        {regeneratingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate'}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => sendNow(s)}
                      disabled={actioningId === s.id || regeneratingId === s.id || !s.draftMessage}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      title={!s.draftMessage ? 'No draft message to send' : undefined}
                    >
                      {actioningId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" />Send Now</>}
                    </button>
                    <button
                      onClick={() => openRegenerate(s.id)}
                      disabled={actioningId === s.id || regeneratingId === s.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white text-indigo-600 text-xs font-medium py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />Regenerate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zuri Marketing — same dashboard, same contacts, just a different funnel */}
        {hasMarketingAccess && marketing && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Zuri Marketing</h2>
              <Link href="/studio" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1">
                Open Studio <ArrowRight size={12} />
              </Link>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{marketing.postsSent}</p>
                <p className="text-xs text-gray-500 mt-0.5">Posts sent</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{marketing.totalLeads}</p>
                <p className="text-xs text-gray-500 mt-0.5">Leads from social</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{marketing.totalSales}</p>
                <p className="text-xs text-gray-500 mt-0.5">Sales attributed</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{marketing.topProduct ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">Top product</p>
              </div>
            </div>
          </div>
        )}

        {marketingAccess === 'waitlisted' && (
          <Link
            href="/studio"
            className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100 hover:border-indigo-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-white text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Send size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">You're on the Zuri Marketing waitlist</p>
              <p className="text-xs text-gray-500">We'll email you when Studio opens — same contacts, same login.</p>
            </div>
            <ChevronRight size={16} className="text-indigo-400 flex-shrink-0" />
          </Link>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mode !== 'personal' && (
              <>
                <QuickAction href="/inbox/queue" Icon={Zap} label="Review AI Suggestions" description="Approve, edit or regenerate reply drafts" iconBg="bg-amber-50" iconColor="text-amber-600" />
                <QuickAction href="/contacts" Icon={Users} label="Contacts CRM" description="View and manage your customer list" iconBg="bg-violet-50" iconColor="text-violet-600" />
                <QuickAction href="/leads" Icon={Flame} label="Hot Leads" description="AI-detected purchase opportunities" iconBg="bg-orange-50" iconColor="text-orange-600" />
              </>
            )}
            {mode !== 'business' && (
              <>
                <QuickAction href="/relationships" Icon={Heart} label="Relationship Health" description="Track and nurture your network" iconBg="bg-rose-50" iconColor="text-rose-500" />
                <QuickAction href="/proactive" Icon={Sparkles} label="Proactive Queue" description="AI-suggested follow-ups and nudges" iconBg="bg-indigo-50" iconColor="text-indigo-600" />
              </>
            )}
            {hasMarketingAccess && (
              <QuickAction href="/studio" Icon={Radio} label="Zuri Marketing Studio" description="Products, AI content, and scheduled posts" iconBg="bg-pink-50" iconColor="text-pink-600" />
            )}
            <QuickAction href="/advisor" Icon={Brain} label="AI Advisor" description="Ask anything about your contacts" iconBg="bg-blue-50" iconColor="text-blue-600" />
            <QuickAction href="/settings" Icon={Settings} label="Settings" description="Configure workspace and AI behavior" iconBg="bg-gray-100" iconColor="text-gray-600" />
          </div>
        </div>

        {/* Empty state when nothing loaded */}
        {!loading && conversations.length === 0 && contacts.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Smartphone size={26} className="text-indigo-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Connect WhatsApp to get started</h3>
            <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Zuri reads your conversations and starts building intelligence immediately.</p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Connect WhatsApp
              <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
