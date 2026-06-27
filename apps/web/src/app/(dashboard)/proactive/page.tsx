'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

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
const PRIORITY_COLORS = [
  '',
  'bg-red-50 border-red-200',
  'bg-orange-50 border-orange-200',
  'bg-white border-gray-200',
  'bg-white border-gray-200',
  'bg-white border-gray-200',
] as const

export default function ProactivePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    apiClient<{ suggestions: ProactiveSuggestion[] }>('/api/proactive', { token }).then((data) => {
      setSuggestions(data.suggestions)
      setLoading(false)
    })
  }, [token])

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
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading suggestions...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <h1 className="font-semibold text-gray-900">Proactive</h1>
        {suggestions.length > 0 && (
          <span className="ml-2 bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5">
            {suggestions.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-900 font-medium mb-1">All caught up</p>
            <p className="text-sm text-gray-400">No pending relationship suggestions right now</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border p-5 ${PRIORITY_COLORS[s.priority] || 'bg-white border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
                      {s.contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.contact.name}</p>
                      <p className="text-xs text-gray-500 capitalize">
                        {s.contact.relationshipType.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">{PRIORITY_LABELS[s.priority]} priority</span>
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
