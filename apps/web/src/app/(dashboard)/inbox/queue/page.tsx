'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Avatar, Badge, EmptyState, PageHeader, SkeletonCard } from '@/components/ui'

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
  message: {
    id: string
    body: string | null
    timestamp: string
    conversation: {
      id: string
      contact: { id: string; name: string; avatarUrl: string | null }
    }
  }
}

interface Conversation {
  id: string
  contact: { id: string; name: string; avatarUrl: string | null }
  lastMessagePreview: string | null
  unreadCount: number
}

type ToneFilter = 'all' | string

const TONE_COLORS: Record<string, string> = {
  friendly:     'bg-green-100 text-green-800',
  professional: 'bg-blue-100 text-blue-800',
  empathetic:   'bg-purple-100 text-purple-800',
  casual:       'bg-gray-100 text-gray-700',
  urgent:       'bg-amber-100 text-amber-800',
  sales:        'bg-orange-100 text-orange-800',
  firm:         'bg-slate-100 text-slate-800',
}

export default function QueuePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const loadQueue = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await apiClient<{ suggestions: Suggestion[] }>('/api/suggestions/pending', { token })
      setSuggestions(data.suggestions)
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadQueue() }, [loadQueue])

  const approve = async (id: string, text?: string) => {
    if (!token) return
    setActionLoading(id)
    try {
      await apiClient(`/api/suggestions/${id}/approve`, {
        method: 'POST',
        token,
        body: text ? JSON.stringify({ text }) : undefined,
      })
      setSuggestions(prev => prev.filter(s => s.id !== id))
      setEditingId(null)
    } finally {
      setActionLoading(null)
    }
  }

  const dismiss = async (id: string) => {
    if (!token) return
    setActionLoading(id)
    try {
      await apiClient(`/api/suggestions/${id}/dismiss`, { method: 'POST', token })
      setSuggestions(prev => prev.filter(s => s.id !== id))
    } finally {
      setActionLoading(null)
    }
  }

  const startEdit = (s: Suggestion) => {
    setEditingId(s.id)
    setEditText(s.text)
  }

  const tones = Array.from(new Set(suggestions.map(s => s.tone)))
  const filtered = toneFilter === 'all' ? suggestions : suggestions.filter(s => s.tone === toneFilter)

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="AI Reply Queue"
          breadcrumbs={[{ label: 'Inbox', href: '/inbox' }, { label: 'Queue' }]}
        />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-2xl mx-auto w-full">
          {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="AI Reply Queue"
        description={filtered.length > 0 ? `${filtered.length} pending suggestion${filtered.length !== 1 ? 's' : ''}` : undefined}
        breadcrumbs={[{ label: 'Inbox', href: '/inbox' }, { label: 'Queue' }]}
        action={
          filtered.length > 0 ? (
            <Link
              href="/inbox"
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Open Inbox
            </Link>
          ) : undefined
        }
      />

      {/* Tone filter */}
      {tones.length > 1 && (
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-2.5 flex items-center gap-1.5 flex-shrink-0 overflow-x-auto">
          {(['all', ...tones] as ToneFilter[]).map(tone => (
            <button
              key={tone}
              onClick={() => setToneFilter(tone)}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                toneFilter === tone
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tone === 'all' ? `All (${suggestions.length})` : `${tone.charAt(0).toUpperCase() + tone.slice(1)} (${suggestions.filter(s => s.tone === tone).length})`}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon="⚡"
            title="Queue is empty"
            description="When Zuri generates reply suggestions, they appear here for your review."
            action={
              <Link href="/inbox" className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                Open Inbox
              </Link>
            }
          />
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {filtered.map(s => {
              const isEditing = editingId === s.id
              return (
                <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Context */}
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50">
                    <Avatar name={s.message.conversation.contact.name} src={s.message.conversation.contact.avatarUrl ?? undefined} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.message.conversation.contact.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.message.body || '(media)'}</p>
                    </div>
                    <span className={`flex-shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${TONE_COLORS[s.tone] ?? 'bg-gray-100 text-gray-700'}`}>
                      {s.tone}
                    </span>
                  </div>

                  {/* Suggestion text */}
                  <div className="px-4 py-4">
                    {isEditing ? (
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={3}
                        className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm text-gray-900 leading-relaxed">&ldquo;{s.text}&rdquo;</p>
                    )}
                    {!isEditing && s.reasoning && (
                      <p className="text-xs text-gray-400 mt-2 leading-relaxed">{s.reasoning}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 flex gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => approve(s.id, editText)}
                          disabled={actionLoading === s.id || !editText.trim()}
                          className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === s.id ? 'Sending…' : 'Send Edited'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 bg-white text-gray-600 text-sm font-medium py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => approve(s.id)}
                          disabled={actionLoading === s.id}
                          className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                          {actionLoading === s.id ? 'Sending…' : '✓ Send'}
                        </button>
                        <button
                          onClick={() => startEdit(s)}
                          className="px-4 bg-white text-gray-600 text-sm font-medium py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => dismiss(s.id)}
                          disabled={actionLoading === s.id}
                          className="px-4 bg-white text-gray-500 text-sm font-medium py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
