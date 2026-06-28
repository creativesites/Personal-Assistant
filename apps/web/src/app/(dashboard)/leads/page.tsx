'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { Avatar, EmptyState, FeatureGate, PageHeader, SkeletonCard } from '@/components/ui'

interface Lead {
  id: string
  name: string
  phone?: string
  avatarUrl: string | null
  lastMessageAt: string | null
  leadScore?: number
  tags?: string[]
  relationship: {
    type: string
    healthScore: number
    healthTrend: 'improving' | 'stable' | 'declining'
    importanceTier: number
  }
  profile: { personalitySummary: string; moodBaseline: string } | null
}

type StageFilter = 'all' | 'hot' | 'warm' | 'cold'
type SortKey = 'score' | 'recent' | 'name'

function scoreStage(score: number | undefined): { label: string; color: string; dot: string } {
  const s = score ?? 0
  if (s >= 70) return { label: 'Hot', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (s >= 40) return { label: 'Warm', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' }
  return { label: 'Cold', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' }
}

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30) return `${diff}d ago`
  return `${Math.floor(diff / 30)}mo ago`
}

function ScoreMeter({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-amber-400' : 'bg-blue-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-gray-700 w-6 text-right">{score}</span>
    </div>
  )
}

export default function LeadsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<StageFilter>('all')
  const [sort, setSort] = useState<SortKey>('score')

  const { data, loading, error } = useApi<{ contacts: Lead[] }>('/api/contacts', token)
  const allContacts = data?.contacts ?? []
  const leads = allContacts.filter(c => c.leadScore !== undefined)

  const stageCounts = useMemo(() => ({
    all:  leads.length,
    hot:  leads.filter(c => (c.leadScore ?? 0) >= 70).length,
    warm: leads.filter(c => { const s = c.leadScore ?? 0; return s >= 40 && s < 70 }).length,
    cold: leads.filter(c => (c.leadScore ?? 0) < 40).length,
  }), [leads])

  const processed = useMemo(() => {
    let result = leads.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      const s = c.leadScore ?? 0
      if (stage === 'hot')  return s >= 70
      if (stage === 'warm') return s >= 40 && s < 70
      if (stage === 'cold') return s < 40
      return true
    })
    return [...result].sort((a, b) => {
      if (sort === 'score')  return (b.leadScore ?? 0) - (a.leadScore ?? 0)
      if (sort === 'name')   return a.name.localeCompare(b.name)
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
  }, [leads, search, stage, sort])

  const STAGES: { key: StageFilter; label: string; emoji: string }[] = [
    { key: 'all',  label: 'All leads',  emoji: '📋' },
    { key: 'hot',  label: 'Hot',        emoji: '🔥' },
    { key: 'warm', label: 'Warm',       emoji: '🌤️' },
    { key: 'cold', label: 'Cold',       emoji: '❄️' },
  ]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Leads" />
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
        title="Leads"
        description={leads.length > 0 ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}` : undefined}
      />

      <FeatureGate
        modes={['business', 'hybrid']}
        fallback={
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-3xl mx-auto mb-4">🔥</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Leads is a Business feature</h3>
              <p className="text-sm text-gray-500 mb-5">Switch to Business or Hybrid mode in settings to access lead scoring and pipeline management.</p>
              <a href="/settings" className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                Go to Settings
              </a>
            </div>
          </div>
        }
      >
        {/* Search + sort */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search leads…"
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
            <option value="score">Highest score</option>
            <option value="recent">Most recent</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        {/* Stage pills */}
        <div className="bg-white border-b border-gray-50 px-4 md:px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          {STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                stage === s.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{s.emoji}</span>
              {s.label}
              <span className={`rounded-full px-1.5 py-px text-[10px] leading-none ${stage === s.key ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {stageCounts[s.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Summary strip */}
        {leads.length > 0 && (
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 md:px-6 py-3 flex items-center gap-6 flex-shrink-0">
            <div className="text-center">
              <p className="text-white font-bold text-lg tabular-nums">{stageCounts.hot}</p>
              <p className="text-indigo-200 text-[11px]">Hot 🔥</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-white font-bold text-lg tabular-nums">{stageCounts.warm}</p>
              <p className="text-indigo-200 text-[11px]">Warm 🌤️</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-white font-bold text-lg tabular-nums">{stageCounts.cold}</p>
              <p className="text-indigo-200 text-[11px]">Cold ❄️</p>
            </div>
            <div className="ml-auto text-right hidden sm:block">
              <p className="text-white text-xs font-medium">Avg score</p>
              <p className="text-white font-bold text-lg tabular-nums">
                {leads.length > 0 ? Math.round(leads.reduce((s, c) => s + (c.leadScore ?? 0), 0) / leads.length) : 0}
              </p>
            </div>
          </div>
        )}

        {/* Cards */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {error ? (
            <EmptyState icon="⚠️" title="Couldn't load leads" description="Make sure the API server is running." />
          ) : leads.length === 0 ? (
            <EmptyState
              icon="🔥"
              title="No leads yet"
              description="When Zuri detects buying signals in your conversations, leads appear here automatically."
            />
          ) : processed.length === 0 ? (
            <EmptyState icon="🔍" title="No leads match" description={search ? `No results for "${search}"` : 'No leads in this stage.'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {processed.map(lead => {
                const stageInfo = scoreStage(lead.leadScore)
                return (
                  <button
                    key={lead.id}
                    onClick={() => router.push(`/contacts/${lead.id}`)}
                    className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Avatar name={lead.name} src={lead.avatarUrl ?? undefined} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{lead.name}</p>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${stageInfo.color}`}>
                            {stageInfo.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 capitalize mt-0.5 truncate">
                          {lead.relationship.type.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>

                    {lead.leadScore !== undefined && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Lead score</span>
                        </div>
                        <ScoreMeter score={lead.leadScore} />
                      </div>
                    )}

                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2.5">
                        {lead.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{tag}</span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <span className="text-xs text-gray-400">Last seen</span>
                      <span className="text-xs font-medium text-gray-600">{formatLastSeen(lead.lastMessageAt)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </FeatureGate>
    </div>
  )
}
