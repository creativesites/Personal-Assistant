'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Gift, Loader2, RefreshCw, ShoppingCart, Sparkles, TrendingUp } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, EmptyState, HealthBar, PageHeader, SkeletonCard, useToast } from '@/components/ui'
import { downloadCsv } from '@/lib/export-csv'

interface RelationshipItem {
  id: string
  name: string
  avatarUrl: string | null
  customerStatus: string
  relationshipType: string
  importanceTier: number
  healthScore: number
  healthTrend: 'improving' | 'stable' | 'declining'
  changeReason: string | null
  lastInteractionAt: string | null
  relationshipCreatedAt: string
  networkValue: Record<string, unknown>
  revenueCents: number
  nextSuggestion: { id: string; title: string } | null
  currentDeal: { title: string; stage: string; probability: number; valueCents: number } | null
  products: string[]
  nextReplacementDate: string | null
  sharedInterests: string[]
  importantDates: Array<{ title: string; type: string; date: string | null; isRecurring: boolean }>
  sharedHistorySince: string | null
}

type FilterKey = 'all' | 'attention' | 'critical' | 'dormant'
type SortKey = 'health' | 'recent' | 'name'

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff}d ago`
  return `${Math.floor(diff / 30)}mo ago`
}

function formatAge(ts: string) {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}yr`
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'ZMW' })
}

const TIER_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'] as const
const TREND: Record<string, { variant: 'success' | 'error' | 'default'; label: string }> = {
  improving: { variant: 'success', label: '↑ Improving' },
  declining:  { variant: 'error',   label: '↓ Declining' },
  stable:     { variant: 'default', label: '→ Stable' },
}

export default function RelationshipsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const { addToast } = useToast()
  const token = session.data?.accessToken
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('health')
  const [analyzing, setAnalyzing] = useState(false)

  const { data, loading, error, refetch } = useApi<{ relationships: RelationshipItem[] }>('/api/relationships', token)
  const contacts = data?.relationships ?? []

  // Pure SQL on both ends (no LLM call), so this works purely from message
  // history already on file — independent of whether WhatsApp is currently
  // connected. See docs/RELATIONSHIP_OS_PLAN.md — health.py/network_value.py.
  const analyzeAll = async () => {
    if (!token) return
    setAnalyzing(true)
    try {
      const res = await apiClient<{ analyzedCount: number }>('/api/relationships/analyze-all', {
        method: 'POST', token,
      })
      addToast({ variant: 'success', title: 'Relationships analyzed', description: `${res.analyzedCount} relationship${res.analyzedCount !== 1 ? 's' : ''} updated` })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to analyze relationships' })
    } finally {
      setAnalyzing(false)
    }
  }

  const stats = useMemo(() => {
    const needsAttention = contacts.filter(
      c => c.healthScore < 60 || c.healthTrend === 'declining',
    ).length
    const avgHealth = contacts.length > 0
      ? Math.round(contacts.reduce((s, c) => s + c.healthScore, 0) / contacts.length)
      : 0
    return { total: contacts.length, needsAttention, avgHealth }
  }, [contacts])

  const filterDefs: { key: FilterKey; label: string; count: number }[] = useMemo(() => [
    { key: 'all',       label: 'All',            count: contacts.length },
    { key: 'attention', label: 'Needs attention', count: contacts.filter(c => c.healthScore < 60 || c.healthTrend === 'declining').length },
    { key: 'critical',  label: 'High priority',  count: contacts.filter(c => c.importanceTier <= 2).length },
    { key: 'dormant',   label: 'Dormant',         count: contacts.filter(c => !c.lastInteractionAt || (Date.now() - new Date(c.lastInteractionAt).getTime()) / 86400000 > 30).length },
  ], [contacts])

  const filtered = useMemo(() => {
    const result = contacts.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      switch (filter) {
        case 'attention': return c.healthScore < 60 || c.healthTrend === 'declining'
        case 'critical':  return c.importanceTier <= 2
        case 'dormant':   return !c.lastInteractionAt || (Date.now() - new Date(c.lastInteractionAt).getTime()) / 86400000 > 30
        default:          return true
      }
    })
    return [...result].sort((a, b) => {
      if (sort === 'health') return a.healthScore - b.healthScore
      if (sort === 'name')   return a.name.localeCompare(b.name)
      const ta = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0
      const tb = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0
      return tb - ta
    })
  }, [contacts, search, filter, sort])

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Relationships" />
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
        title="Relationships"
        description={contacts.length > 0 ? `${stats.total} contact${stats.total !== 1 ? 's' : ''} · avg health ${stats.avgHealth}` : undefined}
      />

      {/* Search + sort */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-shrink-0"
        >
          <option value="health">Needs care first</option>
          <option value="recent">Most recent</option>
          <option value="name">Name A–Z</option>
        </select>
        <button
          onClick={() => downloadCsv('relationship-feed.csv', filtered.map(c => ({
            name: c.name,
            relationshipType: c.relationshipType,
            healthScore: c.healthScore,
            healthTrend: c.healthTrend,
            lastInteractionAt: c.lastInteractionAt,
            revenueCents: c.revenueCents,
            currentDealStage: c.currentDeal?.stage ?? '',
          })))}
          disabled={filtered.length === 0}
          title="Export filtered view as CSV"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          onClick={analyzeAll}
          disabled={analyzing || contacts.length === 0}
          title="Recalculate health and network/connection value for every relationship from message history already on file"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          <span className="hidden sm:inline">Analyze All</span>
        </button>
      </div>

      {/* Filter pills */}
      {contacts.length > 0 && (
        <div className="bg-white border-b border-gray-50 px-4 md:px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          {filterDefs.map(f => {
            if (f.count === 0 && f.key !== 'all') return null
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 py-px text-[10px] leading-none ${
                  filter === f.key ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{f.count}</span>
              </button>
            )
          })}
          {stats.needsAttention > 0 && (
            <span className="ml-auto flex-shrink-0 text-xs text-red-500 font-medium px-2">
              {stats.needsAttention} need attention
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {error ? (
          <EmptyState icon="⚠️" title="Couldn't load contacts" description="Make sure the API server is running." />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No contacts yet"
            description="Connect WhatsApp and exchange messages — relationship scores appear here automatically."
            action={
              <a href="/onboarding" className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {filtered.map(contact => {
              const trend = TREND[contact.healthTrend] ?? TREND.stable
              const isBusiness = 'financialValueCents' in contact.networkValue || contact.revenueCents > 0 || !!contact.currentDeal
              const influenceScore = contact.networkValue.influenceScore ?? contact.networkValue.closenessScore
              return (
                <button
                  key={contact.id}
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                  className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-md transition-all duration-200 group flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                        {contact.name}
                      </p>
                      <p className="text-xs text-gray-500 capitalize truncate mt-0.5">
                        {contact.relationshipType.replace(/_/g, ' ')}
                        {TIER_LABELS[contact.importanceTier] ? ` · ${TIER_LABELS[contact.importanceTier]}` : ''}
                        {' · '}{formatAge(contact.relationshipCreatedAt)}
                      </p>
                    </div>
                  </div>

                  <HealthBar score={contact.healthScore} showLabel size="sm" className="mb-1.5" />
                  {contact.changeReason && (
                    <p className="text-[11px] text-gray-400 leading-snug mb-2.5 line-clamp-2">{contact.changeReason}</p>
                  )}

                  <div className="flex items-center justify-between mb-2.5">
                    <Badge variant={trend.variant}>{trend.label}</Badge>
                    <span className="text-xs text-gray-400">{formatLastSeen(contact.lastInteractionAt)}</span>
                  </div>

                  {/* Business vs personal shape, mirroring NetworkValueCard's data-driven branch */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {isBusiness ? (
                      <>
                        {contact.revenueCents > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
                            {formatCents(contact.revenueCents)}
                          </span>
                        )}
                        {contact.currentDeal && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 capitalize">
                            <TrendingUp size={9} /> {contact.currentDeal.stage.replace(/_/g, ' ')} ({contact.currentDeal.probability}%)
                          </span>
                        )}
                        {contact.products.slice(0, 2).map(p => (
                          <span key={p} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            <ShoppingCart size={9} /> {p}
                          </span>
                        ))}
                        {contact.nextReplacementDate && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            Reorder ~{new Date(contact.nextReplacementDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {contact.sharedInterests.slice(0, 3).map(topic => (
                          <span key={topic} className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 capitalize">
                            {topic}
                          </span>
                        ))}
                        {contact.importantDates.slice(0, 1).map((d, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-700">
                            <Gift size={9} /> {d.title}
                          </span>
                        ))}
                      </>
                    )}
                    {typeof influenceScore === 'number' && (
                      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {isBusiness ? 'Influence' : 'Closeness'} {influenceScore}
                      </span>
                    )}
                  </div>

                  {contact.nextSuggestion && (
                    <p className="mt-auto pt-2 text-[11px] text-indigo-600 flex items-center gap-1 truncate border-t border-gray-50">
                      <Sparkles size={10} className="flex-shrink-0" /> {contact.nextSuggestion.title}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
