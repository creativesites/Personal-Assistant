'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, BadgeVariant, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'

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
const PRIORITY_BORDER = [
  '',
  'border-red-200',
  'border-orange-200',
  'border-gray-200',
  'border-gray-200',
  'border-gray-200',
] as const

function formatType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
      .then(data => { setSuggestions(data.suggestions); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const stats = useMemo(() => ({
    total: suggestions.length,
    urgent: suggestions.filter(s => s.priority <= 2).length,
  }), [suggestions])

  const types = useMemo(() => {
    const seen = new Set<string>()
    suggestions.forEach(s => seen.add(s.suggestionType))
    return Array.from(seen).sort()
  }, [suggestions])

  const filterDefs = useMemo(() => [
    { key: 'all', label: 'All', count: suggestions.length },
    ...types.map(t => ({
      key: t,
      label: formatType(t),
      count: suggestions.filter(s => s.suggestionType === t).length,
    })),
  ], [suggestions, types])

  const filtered = useMemo(() =>
    typeFilter === 'all' ? suggestions : suggestions.filter(s => s.suggestionType === typeFilter),
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
    setSuggestions(prev => prev.filter(s => s.id !== id))
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
        <PageHeader title="Proactive" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Proactive"
        description={suggestions.length > 0 ? `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''} pending` : undefined}
        action={
          suggestions.length > 0 && stats.urgent > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {stats.urgent} urgent
            </span>
          ) : undefined
        }
      />

      {/* Filter strip */}
      {types.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          {filterDefs.map(f => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                typeFilter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {suggestions.length === 0 ? (
          <EmptyState
            icon="✨"
            title="All caught up"
            description="No pending relationship suggestions right now. Zuri will notify you when action is needed."
            action={
              <Link href="/contacts" className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                View contacts
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No suggestions match"
            description={`No suggestions of type "${formatType(typeFilter)}".`}
          />
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {filtered.map(s => (
              <div
                key={s.id}
                className={`bg-white rounded-xl border-2 overflow-hidden shadow-sm ${PRIORITY_BORDER[s.priority] || 'border-gray-200'}`}
              >
                {/* Contact header */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50">
                  <Link href={`/contacts/${s.contact.id}`} className="flex-shrink-0">
                    <Avatar name={s.contact.name} src={s.contact.avatarUrl ?? undefined} size="sm" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/contacts/${s.contact.id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                      {s.contact.name}
                    </Link>
                    <p className="text-xs text-gray-500 capitalize truncate">
                      {s.contact.relationshipType.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="default">{formatType(s.suggestionType)}</Badge>
                    <Badge variant={PRIORITY_VARIANTS[s.priority] ?? 'default'}>
                      {PRIORITY_LABELS[s.priority] ?? 'Normal'}
                    </Badge>
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 pt-4 pb-3">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{s.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>

                  {s.draftMessage && (
                    <div className="mt-3 bg-indigo-50 rounded-xl p-3.5 flex items-start justify-between gap-2">
                      <p className="text-sm text-indigo-900 italic flex-1 leading-relaxed">&ldquo;{s.draftMessage}&rdquo;</p>
                      <button
                        onClick={() => copyDraft(s.id, s.draftMessage!)}
                        className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 transition-colors"
                      >
                        {copied === s.id ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => updateStatus(s.id, 'approved')}
                    disabled={actioning === s.id}
                    className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {actioning === s.id ? 'Saving…' : '✓ Done'}
                  </button>
                  <button
                    onClick={() => updateStatus(s.id, 'dismissed')}
                    disabled={actioning === s.id}
                    className="flex-1 bg-white text-gray-600 text-sm font-medium py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Skip
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
