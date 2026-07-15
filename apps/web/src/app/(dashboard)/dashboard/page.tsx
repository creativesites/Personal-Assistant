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
  X,
  CheckCircle,
  MessageCircle,
  ShieldCheck,
  ListChecks,
  FolderKanban,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, useToast } from '@/components/ui'

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

// Zuri Neural Layer Phase 3 (docs/NEURAL_LAYER_PLAN.md §4.7) — a weekly
// synthesis over signals every other engine already produces, not a new
// detector. Renders only when the intelligence service's scheduled job has
// actually generated one for this user.
interface ReflectionHighlight {
  category: string
  text: string
  evidence: string[]
}
interface ReflectionData {
  id: string
  periodType: string
  periodStart: string
  periodEnd: string
  highlights: ReflectionHighlight[]
  generatedAt: string
}

// AI Daily Brief (docs/RELATIONSHIP_OS_PLAN.md §5.3/§6.2) — a rendering
// layer over proactive_queue/opportunities/relationships, not a new
// detector. Every item already reads as a complete sentence fragment from
// the API (headline), so the frontend just bolds the contact name and
// appends detail/amount — no client-side composition logic needed.
interface BriefItem {
  id: string
  sourceType: 'suggestion' | 'opportunity' | 'health_decline' | 'event' | 'task_overdue' | 'project_behind'
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
  task_overdue: { Icon: ListChecks, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
  project_behind: { Icon: FolderKanban, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
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
    <div className="rounded-2xl bg-gray-50/90 px-3 py-2.5 ring-1 ring-gray-100">
      <p className={`text-lg font-bold tabular-nums ${rollupColor(value)}`}>{value}{suffix}</p>
      <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{label}</p>
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
      className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm shadow-gray-200/40 transition-all group hover:border-indigo-200 hover:shadow-md"
    >
      <div className={`w-11 h-11 rounded-2xl ${iconBg} ${iconColor} flex items-center justify-center flex-shrink-0 group-hover:opacity-90 transition-opacity`}>
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

function sourceLabel(sourceType: BriefItem['sourceType']) {
  if (sourceType === 'opportunity') return 'Opportunity'
  if (sourceType === 'health_decline') return 'Health drop'
  if (sourceType === 'event') return 'Moment'
  if (sourceType === 'task_overdue') return 'Task overdue'
  if (sourceType === 'project_behind') return 'Project behind'
  return 'Nudge'
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
  const [reflection, setReflection] = useState<ReflectionData | null>(null)
  const [marketing, setMarketing] = useState<MarketingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [briefDismissed, setBriefDismissed] = useState(false)
  const [dismissedBriefItems, setDismissedBriefItems] = useState<string[]>([])

  useEffect(() => {
    if (!token) return
    Promise.allSettled([
      apiClient<{ conversations: Conversation[] }>('/api/conversations', { token }),
      apiClient<{ contacts: Contact[] }>('/api/contacts', { token }),
      apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token }),
      apiClient<BriefData>('/api/proactive/brief', { token }),
      apiClient<HealthRollup>('/api/analytics/health-rollup', { token }),
      apiClient<{ reflection: ReflectionData | null }>('/api/reflection/latest', { token }),
    ]).then(([convRes, contactRes, proRes, briefRes, rollupRes, reflectionRes]) => {
      if (convRes.status === 'fulfilled') setConversations(convRes.value.conversations)
      if (contactRes.status === 'fulfilled') setContacts(contactRes.value.contacts)
      if (proRes.status === 'fulfilled') setProactive(proRes.value.suggestions)
      if (briefRes.status === 'fulfilled') setBrief(briefRes.value)
      if (rollupRes.status === 'fulfilled') setRollup(rollupRes.value)
      if (reflectionRes.status === 'fulfilled') setReflection(reflectionRes.value.reflection)
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

  const visibleBriefItems = useMemo(() => {
    const dismissed = new Set(dismissedBriefItems)
    return brief?.items.filter(item => !dismissed.has(`${item.sourceType}-${item.id}`)) ?? []
  }, [brief, dismissedBriefItems])

  if (session.status === 'loading') {
    return (
      <div className="min-h-full bg-slate-950 p-4 md:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-40 rounded-[2rem] bg-white/10 animate-pulse" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 rounded-3xl bg-white/10 animate-pulse" />)}
          </div>
          <SkeletonCard />
        </div>
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
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <div className="flex-1 px-4 pb-8 pt-4 md:px-6 md:pt-6">
        <div className="mx-auto w-full max-w-5xl space-y-5 md:space-y-6">
          <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 px-4 py-5 text-slate-950 shadow-2xl shadow-indigo-200/40 ring-1 ring-white sm:px-6 md:px-7 md:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.28),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.22),transparent_30%)]" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm shadow-indigo-100 ring-1 ring-indigo-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                    Live relationship OS
                  </div>
                  <h1 className="max-w-xl text-2xl font-bold leading-tight tracking-tight md:text-4xl">
                    {greeting(session.data?.user.name)}
                  </h1>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600 md:text-base">
                    {loading
                      ? 'Loading the signals that matter most.'
                      : stats.unread > 0
                      ? `${stats.unread} unread message${stats.unread !== 1 ? 's' : ''}, ${stats.proactiveCount} proactive move${stats.proactiveCount !== 1 ? 's' : ''}, and ${stats.needsAttention} relationship${stats.needsAttention !== 1 ? 's' : ''} to protect.`
                      : 'No urgent messages right now. Zuri is still watching for moments that need your touch.'}
                  </p>
                </div>
                <Link
                  href="/advisor"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/15 transition-transform active:scale-95 md:h-auto md:w-auto md:gap-2 md:px-4 md:py-2.5 md:text-sm md:font-semibold"
                  aria-label="Open AI Advisor"
                >
                  <Brain size={18} />
                  <span className="hidden md:inline">Ask Zuri</span>
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Today</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-5xl font-black tracking-tight tabular-nums md:text-6xl">{stats.unread}</span>
                    <span className="pb-2 text-sm font-semibold text-slate-500">unread</span>
                  </div>
                </div>
                <Link
                  href="/inbox"
                  className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-colors hover:bg-indigo-500 active:bg-indigo-700"
                >
                  <Inbox size={17} />
                  Inbox
                  {stats.unread > 0 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{stats.unread}</span>}
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 rounded-3xl bg-white/70 p-2 shadow-sm shadow-indigo-100/60 ring-1 ring-white">
                <Link href="/proactive" className="rounded-2xl px-3 py-3 transition-colors hover:bg-white active:bg-indigo-50">
                  <p className="text-xl font-bold tabular-nums">{stats.proactiveCount}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Moves</p>
                </Link>
                <Link href={mode === 'business' ? '/contacts' : '/relationships'} className="rounded-2xl px-3 py-3 transition-colors hover:bg-white active:bg-indigo-50">
                  <p className="text-xl font-bold tabular-nums">{stats.totalContacts}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">People</p>
                </Link>
                <Link href="/analytics/health" className="rounded-2xl px-3 py-3 transition-colors hover:bg-white active:bg-indigo-50">
                  <p className="text-xl font-bold tabular-nums">{mode === 'personal' ? stats.avgHealth : stats.pending}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{mode === 'personal' ? 'Health' : 'Active'}</p>
                </Link>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {displayStats.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={i} className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 transition-shadow hover:shadow-md">
                  <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${s.iconBg} ${s.iconColor}`}>
                    <Icon size={17} />
                  </div>
                  <p className="text-2xl font-black leading-none tracking-tight text-gray-950 tabular-nums">{s.value}</p>
                  <p className="mt-1.5 text-xs font-semibold leading-tight text-gray-500">{s.label}</p>
                </div>
              )
            })}
          </div>

          {/* AI Daily Brief — same greeting/place every morning, real names and numbers */}
          {brief && !briefDismissed && (visibleBriefItems.length > 0 || brief.revenueAtRisk) && (
            <section className="overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-indigo-200/30 ring-1 ring-indigo-100">
              <div className="relative bg-gradient-to-br from-indigo-100 via-white to-cyan-100 px-4 py-4 text-slate-950 sm:px-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(34,211,238,0.22),transparent_28%)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm shadow-indigo-100 ring-1 ring-indigo-100">
                      <Sparkles size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-600">AI Daily Brief</p>
                      <h2 className="mt-1 text-lg font-bold tracking-tight">
                        {mode === 'personal' ? 'People worth your attention' : 'Your highest-leverage moves'}
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Clear the deck one signal at a time. Dismiss what is handled, open what needs context.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBriefDismissed(true)}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-500 shadow-sm ring-1 ring-white transition-colors hover:bg-white hover:text-slate-900"
                    aria-label="Dismiss AI Daily Brief"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <Link href="/proactive" className="flex min-w-[138px] items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 text-xs font-bold text-slate-800 shadow-sm ring-1 ring-white">
                    <Zap size={14} className="text-amber-500" />
                    {visibleBriefItems.length} live signal{visibleBriefItems.length !== 1 ? 's' : ''}
                  </Link>
                  {brief.revenueAtRisk && (
                    <Link href="/analytics/opportunities" className="flex min-w-[164px] items-center gap-2 rounded-2xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 shadow-sm ring-1 ring-red-100">
                      <AlertTriangle size={14} />
                      {formatCents(brief.revenueAtRisk.cents)} at risk
                    </Link>
                  )}
                  <Link href="/advisor" className="flex min-w-[130px] items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 text-xs font-bold text-slate-800 shadow-sm ring-1 ring-white">
                    <MessageCircle size={14} className="text-cyan-600" />
                    Ask why
                  </Link>
                </div>
              </div>

              <div className="space-y-3 p-3 sm:p-4">
                {visibleBriefItems.map(item => {
                  const style = BRIEF_STYLES[item.sourceType]
                  const Icon = style.Icon
                  const itemKey = `${item.sourceType}-${item.id}`
                  return (
                    <div key={itemKey} className="rounded-3xl border border-gray-100 bg-gray-50/80 p-3 transition-colors hover:bg-white">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${style.iconBg} ${style.iconColor}`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Avatar name={item.contact.name} src={item.contact.avatarUrl ?? undefined} size="xs" />
                            <span className="truncate text-sm font-bold text-gray-950">{item.contact.name}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-100">
                              {sourceLabel(item.sourceType)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-gray-700">
                            <span className="font-semibold text-gray-950">{item.headline}</span>
                          </p>
                          {item.detail && <p className="mt-1 text-xs leading-5 text-gray-500">{item.detail}</p>}
                          {item.amountCents !== null && (
                            <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                              {formatCents(item.amountCents)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDismissedBriefItems(prev => [...prev, itemKey])}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                          aria-label={`Dismiss brief item for ${item.contact.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link
                          href={`/contacts/${item.contact.id}`}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl bg-gray-950 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800"
                        >
                          Open profile <ChevronRight size={13} />
                        </Link>
                        <Link
                          href="/proactive"
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
                        >
                          Draft move <Sparkles size={13} />
                        </Link>
                      </div>
                    </div>
                  )
                })}

                {visibleBriefItems.length === 0 && (
                  <div className="flex items-center gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-100">
                    <CheckCircle size={18} />
                    <div>
                      <p className="text-sm font-bold">Brief cleared</p>
                      <p className="text-xs text-emerald-700/80">You dismissed every signal in today&apos;s brief.</p>
                    </div>
                  </div>
                )}

                {brief.revenueAtRisk && (
                  <Link href="/analytics/opportunities" className="flex items-center gap-3 rounded-3xl bg-red-50 p-4 text-red-800 ring-1 ring-red-100 transition-colors hover:bg-red-100/70">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                      <ShieldCheck size={16} />
                    </div>
                    <p className="text-sm leading-5">
                      Protect <span className="font-black">{formatCents(brief.revenueAtRisk.cents)}</span> across {brief.revenueAtRisk.contactCount} customer{brief.revenueAtRisk.contactCount !== 1 ? 's' : ''}.
                    </p>
                  </Link>
                )}
              </div>
            </section>
          )}

        {/* Health Rollup — composite score across categories already computed
            piecemeal elsewhere; both shapes always fetched, shown per mode */}
        {rollup && (
          <div className="grid md:grid-cols-2 gap-4">
            {(mode === 'business' || mode === 'hybrid') && rollup.business.overall !== null && (
              <div className="rounded-[1.75rem] border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/70">
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
              <div className="rounded-[1.75rem] border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/70">
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
                  <div className="rounded-2xl bg-gray-50/90 px-3 py-2.5 ring-1 ring-gray-100">
                    <p className="text-lg font-bold tabular-nums text-gray-700">{rollup.personal.dormantCount}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Dormant</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekly Reflection — Zuri Neural Layer Phase 3, a synthesis over
            signals every other engine already produces (docs/NEURAL_LAYER_PLAN.md §4.7) */}
        {reflection && reflection.highlights.length > 0 && (
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white bg-gradient-to-br from-white via-indigo-50 to-cyan-50 p-5 shadow-sm shadow-indigo-200/40 ring-1 ring-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 shadow-lg shadow-indigo-200 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Your Week in Review</h2>
                  <p className="text-[11px] text-gray-500">
                    {new Date(reflection.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(reflection.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <Link href="/timeline" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1">
                Life Timeline <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {reflection.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-white/80 px-3 py-2.5 ring-1 ring-indigo-100/70">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-800">{h.text}</p>
                    {h.evidence.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-0.5">{h.evidence.join(' · ')}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hybrid: split mode overview */}
        {mode === 'hybrid' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-[1.75rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 shadow-sm shadow-indigo-100/60">
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
            <div className="rounded-[1.75rem] border border-rose-100 bg-gradient-to-br from-rose-50 to-orange-50 p-4 shadow-sm shadow-rose-100/60">
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
            <div className="overflow-hidden rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
              {recentConversations.map(conv => (
                <Link
                  key={conv.id}
                  href="/inbox"
                  className="flex items-center gap-3 border-b border-gray-50 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-gray-50/80"
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
                  className="flex items-center gap-3 rounded-[1.75rem] border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/60 transition-all hover:border-red-200 hover:shadow-md"
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
            <div className="overflow-hidden rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70">
              {proactive.slice(0, 3).map(s => (
                <div key={s.id} className="border-b border-gray-50 px-4 py-3.5 last:border-b-0">
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
            <div className="grid grid-cols-2 gap-4 rounded-[1.75rem] border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/70 sm:grid-cols-4">
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
            className="flex items-center gap-3 rounded-[1.75rem] border border-indigo-100 bg-indigo-50 p-4 shadow-sm shadow-indigo-100/60 transition-colors hover:border-indigo-300"
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
          <div className="rounded-[2rem] border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm shadow-gray-200/60">
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
    </div>
  )
}
