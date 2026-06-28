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
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, HealthBar, SkeletonCard, StatCard } from '@/components/ui'

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
  contact: { name: string; avatarUrl: string | null }
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

type LucideIcon = React.ComponentType<{ className?: string; size?: number | string }>

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
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [proactive, setProactive] = useState<ProactiveSuggestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    Promise.allSettled([
      apiClient<{ conversations: Conversation[] }>('/api/conversations', { token }),
      apiClient<{ contacts: Contact[] }>('/api/contacts', { token }),
      apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token }),
    ]).then(([convRes, contactRes, proRes]) => {
      if (convRes.status === 'fulfilled') setConversations(convRes.value.conversations)
      if (contactRes.status === 'fulfilled') setContacts(contactRes.value.contacts)
      if (proRes.status === 'fulfilled') setProactive(proRes.value.suggestions)
      setLoading(false)
    })
  }, [token])

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
                <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar name={s.contact.name} src={s.contact.avatarUrl ?? undefined} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.contact.name}</p>
                    <p className="text-xs text-gray-500 truncate">{s.title}</p>
                  </div>
                  {s.priority <= 2 && <Badge variant="error" dot>Urgent</Badge>}
                </div>
              ))}
            </div>
          </div>
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
