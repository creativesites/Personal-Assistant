'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, HealthBar, Badge, EmptyState, SkeletonCard } from '@/components/ui'

interface ContactRelationship {
  type: string
  importanceTier: number
  healthScore: number
  healthTrend: 'improving' | 'stable' | 'declining'
  lastInteractionAt: string | null
}

interface Contact {
  id: string
  name: string
  avatarUrl: string | null
  lastMessageAt: string | null
  relationship: ContactRelationship
  profile: { personalitySummary: string; moodBaseline: string } | null
}

type FilterKey = 'all' | 'attention' | 'critical' | 'dormant'
type SortKey = 'health' | 'recent' | 'name'

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diffDays = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

const TIER_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'] as const

const TREND: Record<string, { variant: 'success' | 'error' | 'default'; label: string }> = {
  improving: { variant: 'success', label: '↑ Improving' },
  declining:  { variant: 'error',   label: '↓ Declining'  },
  stable:     { variant: 'default', label: '→ Stable'     },
}

export default function RelationshipsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('health')

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: Contact[] }>('/api/contacts', { token })
      .then((data) => { setContacts(data.contacts); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [token])

  const stats = useMemo(() => {
    const needsAttention = contacts.filter(
      (c) => c.relationship.healthScore < 60 || c.relationship.healthTrend === 'declining',
    ).length
    const avgHealth = contacts.length > 0
      ? Math.round(contacts.reduce((s, c) => s + c.relationship.healthScore, 0) / contacts.length)
      : 0
    return { total: contacts.length, needsAttention, avgHealth }
  }, [contacts])

  const filterDefs = useMemo<{ key: FilterKey; label: string; count: number }[]>(() => [
    { key: 'all',       label: 'All',            count: contacts.length },
    { key: 'attention', label: 'Needs attention', count: contacts.filter(c => c.relationship.healthScore < 60 || c.relationship.healthTrend === 'declining').length },
    { key: 'critical',  label: 'High priority',   count: contacts.filter(c => c.relationship.importanceTier <= 2).length },
    { key: 'dormant',   label: 'Dormant',         count: contacts.filter(c => { if (!c.relationship.lastInteractionAt) return true; return (Date.now() - new Date(c.relationship.lastInteractionAt).getTime()) / 86400000 > 30 }).length },
  ], [contacts])

  const filtered = useMemo(() => {
    let result = contacts.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      switch (filter) {
        case 'attention': return c.relationship.healthScore < 60 || c.relationship.healthTrend === 'declining'
        case 'critical':  return c.relationship.importanceTier <= 2
        case 'dormant':   return !c.relationship.lastInteractionAt || (Date.now() - new Date(c.relationship.lastInteractionAt).getTime()) / 86400000 > 30
        default:          return true
      }
    })
    return [...result].sort((a, b) => {
      if (sort === 'health')  return a.relationship.healthScore - b.relationship.healthScore
      if (sort === 'name')    return a.name.localeCompare(b.name)
      const ta = a.relationship.lastInteractionAt ? new Date(a.relationship.lastInteractionAt).getTime() : 0
      const tb = b.relationship.lastInteractionAt ? new Date(b.relationship.lastInteractionAt).getTime() : 0
      return tb - ta
    })
  }, [contacts, search, filter, sort])

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
          <h1 className="font-semibold text-gray-900">Relationships</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
          <h1 className="font-semibold text-gray-900">Relationships</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon="⚠️" title="Couldn't load contacts" description="Make sure the API server is running." />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center gap-4 px-6 shrink-0">
        <h1 className="font-semibold text-gray-900 shrink-0">Relationships</h1>
        <div className="flex-1 max-w-xs">
          <input
            type="search"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="ml-auto text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
        >
          <option value="health">Needs care first</option>
          <option value="recent">Most recent</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {/* Stats + filter pills */}
      {contacts.length > 0 && (
        <div className="border-b border-gray-100 bg-white px-6 py-2.5 flex items-center gap-4 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-3 text-sm shrink-0">
            <span className="font-semibold text-gray-900 tabular-nums">{stats.total}</span>
            <span className="text-gray-400">contacts</span>
            {stats.needsAttention > 0 && (
              <>
                <span className="text-gray-200">·</span>
                <span className="font-semibold text-red-500 tabular-nums">{stats.needsAttention}</span>
                <span className="text-gray-400">need attention</span>
              </>
            )}
            <span className="text-gray-200">·</span>
            <span className="font-semibold text-gray-900 tabular-nums">{stats.avgHealth}</span>
            <span className="text-gray-400">avg health</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {filterDefs.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                {f.count > 0 && (
                  <span className={`rounded-full px-1.5 py-px text-[10px] leading-none ${
                    filter === f.key ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>{f.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {contacts.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No contacts yet"
            description="Connect WhatsApp and exchange a few messages — your contacts and relationship scores appear here automatically."
            action={
              <a href="/onboarding" className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                Connect WhatsApp
              </a>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No contacts match"
            description={search ? `No results for "${search}"` : 'No contacts match the selected filter.'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((contact) => {
              const trend = TREND[contact.relationship.healthTrend] ?? TREND.stable
              return (
                <button
                  key={contact.id}
                  onClick={() => router.push(`/relationships/${contact.id}`)}
                  className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-indigo-200 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                        {contact.name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize truncate">
                        {contact.relationship.type.replace(/_/g, ' ')}
                        {TIER_LABELS[contact.relationship.importanceTier]
                          ? ` · ${TIER_LABELS[contact.relationship.importanceTier]}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <HealthBar score={contact.relationship.healthScore} showLabel size="sm" className="mb-2.5" />
                  <div className="flex items-center justify-between">
                    <Badge variant={trend.variant}>{trend.label}</Badge>
                    <span className="text-xs text-gray-400">{formatLastSeen(contact.relationship.lastInteractionAt)}</span>
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
