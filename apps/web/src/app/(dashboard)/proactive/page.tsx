'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ClipboardCopy, Flame, Loader2, RefreshCw, Search, Send, Sparkles, XCircle } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Avatar, Badge, BadgeVariant, EmptyState, PageHeader, SkeletonCard, useToast } from '@/components/ui'

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

// AI Recommendations (docs/RELATIONSHIP_OS_PLAN.md §5.11/§6.10) — a ranked
// view over the same proactive_queue this page already shows, plus
// opportunities and stalling deals, sorted by one composite score. Not a
// separate detector — just a different lens on data that mostly already
// has its own home (the Queue tab, /contacts/[id]).
interface Recommendation {
  id: string
  sourceType: 'suggestion' | 'opportunity' | 'stalling_deal'
  title: string
  description: string | null
  estimatedValueCents: number | null
  confidence: number | null
  score: number
  contact: { id: string; name: string; avatarUrl: string | null }
}

const SOURCE_LABELS: Record<Recommendation['sourceType'], string> = {
  suggestion: 'Suggestion',
  opportunity: 'Opportunity',
  stalling_deal: 'Stalled deal',
}
const SOURCE_VARIANTS: Record<Recommendation['sourceType'], BadgeVariant> = {
  suggestion: 'info',
  opportunity: 'success',
  stalling_deal: 'warning',
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
  const { addToast } = useToast()
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [view, setView] = useState<'queue' | 'recommendations'>('queue')
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [recsLoading, setRecsLoading] = useState(true)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [regenTargetId, setRegenTargetId] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')

  useEffect(() => {
    if (!token) return
    apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token })
      .then(data => { setSuggestions(data.suggestions); setLoading(false) })
      .catch(() => setLoading(false))
    apiClient<{ recommendations: Recommendation[] }>('/api/proactive/recommendations', { token })
      .then(data => { setRecommendations(data.recommendations); setRecsLoading(false) })
      .catch(() => setRecsLoading(false))

    // Zuri Reality Engine (docs/REALITY_ENGINE_PLAN.md §10) — a nudge just
    // got auto-resolved because reality caught up with it (a reply was
    // sent, an invoice was created). Refetch rather than guess which
    // specific row(s) to remove client-side, since the payload only
    // carries a contact + count, not which suggestion types were touched.
    const socket = getSocket(token)
    const handleResolved = (payload: string) => {
      try {
        const data = JSON.parse(payload) as { contactId: string; count: number; reason: string }
        if (data.count > 0) {
          apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token })
            .then(d => setSuggestions(d.suggestions))
            .catch(() => {})
        }
      } catch { /* ignore */ }
    }
    socket.on('reality.resolved', handleResolved)
    return () => { socket.off('reality.resolved', handleResolved) }
  }, [token])

  const dismissRecommendation = async (rec: Recommendation) => {
    if (!token || rec.sourceType !== 'opportunity') return
    setRecommendations(prev => prev.filter(r => r.id !== rec.id))
    await apiClient(`/api/opportunities/${rec.id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status: 'dismissed' }),
    })
  }

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

  const sendNow = async (s: ProactiveSuggestion) => {
    if (!token || !s.draftMessage) return
    setActioning(s.id)
    try {
      await apiClient(`/api/proactive/${s.id}/send`, { method: 'POST', token })
      setSuggestions(prev => prev.filter(item => item.id !== s.id))
      addToast({ variant: 'success', title: 'Message sent', description: `Sent to ${s.contact.name}.` })
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Could not send message',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      })
    } finally {
      setActioning(null)
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
        id: string; suggestionType: string; title: string; body: string
        draftMessage: string | null; priority: number
      } }>(`/api/proactive/${id}/regenerate`, {
        method: 'POST',
        token,
        body: JSON.stringify({ instruction: instruction.trim() || undefined }),
      })
      setSuggestions(prev => prev.map(item => item.id === id
        ? {
            ...item,
            suggestionType: data.suggestion.suggestionType,
            title: data.suggestion.title,
            body: data.suggestion.body,
            draftMessage: data.suggestion.draftMessage,
            priority: data.suggestion.priority,
          }
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

      {/* View toggle: Queue (approve/dismiss suggestions) vs Recommendations (ranked across sources) */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex items-center gap-1.5 flex-shrink-0">
        {(['queue', 'recommendations'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              view === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {v === 'queue' ? 'Queue' : 'Recommendations'}
          </button>
        ))}
      </div>

      {/* Filter strip */}
      {view === 'queue' && types.length > 1 && (
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
        {view === 'recommendations' ? (
          recsLoading ? (
            <div className="max-w-2xl mx-auto space-y-4">
              {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : recommendations.length === 0 ? (
            <EmptyState
              icon={<Flame className="w-10 h-10 text-indigo-500" />}
              title="Nothing to prioritize"
              description="No open opportunities, stalled deals, or pending suggestions right now."
            />
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              {recommendations.map(r => (
                <div key={`${r.sourceType}-${r.id}`} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Link href={`/contacts/${r.contact.id}`} className="flex-shrink-0">
                      <Avatar name={r.contact.name} src={r.contact.avatarUrl ?? undefined} size="sm" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/contacts/${r.contact.id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                        {r.contact.name}
                      </Link>
                      <h3 className="text-sm font-semibold text-gray-900 mt-0.5">{r.title}</h3>
                    </div>
                    <Badge variant={SOURCE_VARIANTS[r.sourceType]} className="flex-shrink-0">{SOURCE_LABELS[r.sourceType]}</Badge>
                  </div>
                  {r.description && <p className="text-sm text-gray-600 leading-relaxed mt-2">{r.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      {r.estimatedValueCents !== null && (
                        <span className="font-medium text-green-600">
                          {(r.estimatedValueCents / 100).toLocaleString(undefined, { style: 'currency', currency: 'ZMW' })}
                        </span>
                      )}
                      {r.confidence !== null && <span>{Math.round(r.confidence * 100)}% confidence</span>}
                    </div>
                    {r.sourceType === 'opportunity' && (
                      <button
                        onClick={() => dismissRecommendation(r)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        <XCircle className="w-3.5 h-3.5" />Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-10 h-10 text-indigo-500" />}
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
            icon={<Search className="w-10 h-10 text-gray-400" />}
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
                        className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 transition-colors"
                      >
                        {copied === s.id ? (
                          <><CheckCircle2 className="w-3 h-3" />Copied</>
                        ) : (
                          <><ClipboardCopy className="w-3 h-3" />Copy</>
                        )}
                      </button>
                    </div>
                  )}

                  {regenTargetId === s.id && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') regenerate(s.id) }}
                        placeholder="Optional: tell Zuri what to change (e.g. 'make it shorter')"
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                      />
                      <button
                        onClick={() => regenerate(s.id)}
                        disabled={regeneratingId === s.id}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                      >
                        {regeneratingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => sendNow(s)}
                      disabled={actioning === s.id || regeneratingId === s.id || !s.draftMessage}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                      title={!s.draftMessage ? 'No draft message to send' : undefined}
                    >
                      {actioning === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" />Send Now</>}
                    </button>
                    <button
                      onClick={() => openRegenerate(s.id)}
                      disabled={actioning === s.id || regeneratingId === s.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-indigo-600 text-sm font-medium py-2.5 rounded-xl border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />Regenerate
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(s.id, 'approved')}
                      disabled={actioning === s.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 text-gray-500 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />Mark done
                    </button>
                    <button
                      onClick={() => updateStatus(s.id, 'dismissed')}
                      disabled={actioning === s.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 text-gray-500 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />Skip
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
