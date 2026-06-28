'use client'

import { useEffect, useMemo, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, EmptyState, SkeletonCard } from '@/components/ui'

interface ProactiveSuggestion {
  id: string
  suggestionType: string
  title: string
  body: string
  draftMessage: string | null
  priority: number
  suggestedForDate: string
  contact: {
    id: string
    name: string
    avatarUrl: string | null
    relationshipType: string
  }
}

const PRIORITY_LABELS = ['', 'Urgent', 'High', 'Medium', 'Low', 'Minimal'] as const
const PRIORITY_VARIANTS: Record<number, BadgeVariant> = { 1: 'error', 2: 'warning' }
const PRIORITY_COLORS = [
  '',
  'bg-red-50 border-red-200',
  'bg-orange-50 border-orange-200',
  'bg-white border-gray-200',
  'bg-white border-gray-200',
  'bg-white border-gray-200',
] as const

function formatType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ProactivePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    if (!token) return
    apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token })
      .then((data) => { setSuggestions(data.suggestions); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const stats = useMemo(() => ({
    total: suggestions.length,
    urgent: suggestions.filter((s) => s.priority <= 2).length,
  }), [suggestions])

  const types = useMemo(() => {
    const seen = new Set<string>()
    suggestions.forEach((s) => seen.add(s.suggestionType))
    return Array.from(seen).sort()
  }, [suggestions])

  const filterDefs = useMemo(() => [
    { key: 'all', label: 'All', count: suggestions.length },
    ...types.map((t) => ({
      key: t,
      label: formatType(t),
      count: suggestions.filter((s) => s.suggestionType === t).length,
    })),
  ], [suggestions, types])

  const filtered = useMemo(() =>
    typeFilter === 'all' ? suggestions : suggestions.filter((s) => s.suggestionType === typeFilter),
    [suggestions, typeFilter],
  )

  const updateStatus = async (id: string, status: 'approved' | 'dismissed') => {
    if (!token) return
    setActioning(id)
    await apiClient(`/api/proactive/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    })
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
    setActioning(null)
  }

  const copyDraft = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
          <h1 className="font-semibold text-gray-900">Proactive</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <h1 className="font-semibold text-gray-900">Proactive</h1>
        {suggestions.length > 0 && (
          <span className="ml-2 bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5 font-medium">
            {suggestions.length}
          </span>
        )}
      </div>

      {/* Stats + filter strip */}
      {suggestions.length > 0 && (
        <div className="border-b border-gray-100 bg-white px-6 py-2.5 flex items-center gap-4 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-3 text-sm shrink-0">
            <span className="font-semibold text-gray-900 tabular-nums">{stats.total}</span>
            <span className="text-gray-400">pending</span>
            {stats.urgent > 0 && (
              <>
                <span className="text-gray-200">·</span>
                <span className="font-semibold text-red-500 tabular-nums">{stats.urgent}</span>
                <span className="text-gray-400">urgent</span>
              </>
            )}
          </div>

          {types.length > 1 && (
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {filterDefs.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    typeFilter === f.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                  <span className={`rounded-full px-1.5 py-px text-[10px] leading-none ${
                    typeFilter === f.key ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>{f.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {suggestions.length === 0 ? (
          <EmptyState
            icon="✨"
            title="All caught up"
            description="No pending relationship suggestions right now. Check back soon."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No suggestions match"
            description={`No suggestions of type "${formatType(typeFilter)}".`}
          />
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {filtered.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border p-5 ${PRIORITY_COLORS[s.priority] || 'bg-white border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.contact.name} src={s.contact.avatarUrl ?? undefined} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.contact.name}</p>
                      <p className="text-xs text-gray-500 capitalize">
                        {s.contact.relationshipType.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={PRIORITY_VARIANTS[s.priority] ?? 'default'}>
                    {PRIORITY_LABELS[s.priority] ?? 'Normal'} priority
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default">{formatType(s.suggestionType)}</Badge>
                </div>

                <h3 className="font-medium text-gray-900 text-sm mb-1">{s.title}</h3>
                <p className="text-sm text-gray-600 mb-3 leading-relaxed">{s.body}</p>

                {s.draftMessage && (
                  <div className="bg-indigo-50 rounded-lg p-3 mb-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-indigo-900 italic flex-1">&ldquo;{s.draftMessage}&rdquo;</p>
                      <button
                        onClick={() => copyDraft(s.id, s.draftMessage!)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                      >
                        {copied === s.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus(s.id, 'approved')}
                    disabled={actioning === s.id}
                    className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => updateStatus(s.id, 'dismissed')}
                    disabled={actioning === s.id}
                    className="flex-1 bg-gray-100 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
