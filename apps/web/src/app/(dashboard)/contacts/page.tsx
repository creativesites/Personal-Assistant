'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Users,
  SlidersHorizontal,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, Badge, EmptyState, HealthBar, PageHeader, SkeletonCard } from '@/components/ui'

interface Contact {
  id: string
  name: string
  phone?: string
  avatarUrl: string | null
  lastMessageAt: string | null
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
  }
  profile: { personalitySummary: string; moodBaseline: string } | null
  tags?: string[]
  leadScore?: number
}

type SortKey = 'health' | 'recent' | 'name' | 'lead'
type FilterKey = 'all' | 'hot' | 'attention' | 'vip'

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff}d ago`
  return `${Math.floor(diff / 30)}mo ago`
}

const TREND_CONFIG = {
  improving: { Icon: TrendingUp,   class: 'text-green-600', label: 'Improving' },
  stable:    { Icon: Minus,        class: 'text-gray-400',  label: 'Stable'    },
  declining: { Icon: TrendingDown, class: 'text-red-500',   label: 'Declining' },
}

export default function ContactsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [filter, setFilter] = useState<FilterKey>('all')

  const { data, loading, error } = useApi<{ contacts: Contact[] }>('/api/contacts', token)
  const contacts = data?.contacts ?? []

  const filters: { key: FilterKey; label: string; count: (cs: Contact[]) => number }[] = [
    { key: 'all',       label: 'All',         count: cs => cs.length },
    { key: 'hot',       label: 'Hot leads',   count: cs => cs.filter(c => (c.leadScore ?? 0) >= 70).length },
    { key: 'attention', label: 'Attention',   count: cs => cs.filter(c => c.relationship.healthScore < 60).length },
    { key: 'vip',       label: 'VIP',         count: cs => cs.filter(c => c.relationship.importanceTier === 1).length },
  ]

  const processed = useMemo(() => {
    let result = contacts.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      switch (filter) {
        case 'hot':       return (c.leadScore ?? 0) >= 70
        case 'attention': return c.relationship.healthScore < 60
        case 'vip':       return c.relationship.importanceTier === 1
        default: return true
      }
    })
    return [...result].sort((a, b) => {
      if (sort === 'name')   return a.name.localeCompare(b.name)
      if (sort === 'health') return a.relationship.healthScore - b.relationship.healthScore
      if (sort === 'lead')   return (b.leadScore ?? 0) - (a.leadScore ?? 0)
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
  }, [contacts, search, filter, sort])

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Contacts" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Contacts"
        description={contacts.length > 0 ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}` : undefined}
      />

      {/* Search + sort bar */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
          />
        </div>
        <div className="relative flex-shrink-0">
          <SlidersHorizontal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="pl-8 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
          >
            <option value="recent">Most recent</option>
            <option value="health">Health score</option>
            <option value="name">Name A–Z</option>
            {mode !== 'personal' && <option value="lead">Lead score</option>}
          </select>
        </div>
      </div>

      {/* Filter pills */}
      {contacts.length > 0 && (
        <div className="bg-white border-b border-gray-50 px-4 md:px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          {filters.map(f => {
            const count = f.count(contacts)
            if (count === 0 && f.key !== 'all') return null
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 py-px text-[10px] leading-none font-semibold ${filter === f.key ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {error ? (
          <EmptyState
            icon={<AlertCircle size={36} className="text-gray-400" />}
            title="Couldn't load contacts"
            description="Make sure the API server is running."
          />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users size={36} className="text-gray-400" />}
            title="No contacts yet"
            description="Connect WhatsApp and start chatting — contacts appear automatically."
            action={
              <a href="/onboarding" className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
                Connect WhatsApp
              </a>
            }
          />
        ) : processed.length === 0 ? (
          <EmptyState
            icon={<Search size={36} className="text-gray-400" />}
            title="No contacts match"
            description={search ? `No results for "${search}"` : 'No contacts match this filter.'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {processed.map(contact => {
              const trend = TREND_CONFIG[contact.relationship.healthTrend] ?? TREND_CONFIG.stable
              const TrendIcon = trend.Icon
              return (
                <button
                  key={contact.id}
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                  className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-md transition-all duration-200 group"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                        {contact.name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize truncate mt-0.5">
                        {contact.relationship.type.replace(/_/g, ' ')}
                      </p>
                      {contact.tags && contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {contact.tags.slice(0, 2).map(tag => (
                            <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {mode !== 'personal' && contact.leadScore !== undefined && (
                      <div className={`flex-shrink-0 flex flex-col items-center justify-center w-9 h-9 rounded-lg text-xs font-bold ${
                        contact.leadScore >= 70 ? 'bg-green-50 text-green-700 border border-green-100' :
                        contact.leadScore >= 40 ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}>
                        <TrendingUp size={10} className="mb-0.5 opacity-70" />
                        {contact.leadScore}
                      </div>
                    )}
                  </div>

                  <HealthBar score={contact.relationship.healthScore} size="sm" className="mb-2.5" />

                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium flex items-center gap-1 ${trend.class}`}>
                      <TrendIcon size={12} />
                      {trend.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatLastSeen(contact.lastMessageAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
