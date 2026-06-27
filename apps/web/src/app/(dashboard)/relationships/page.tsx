'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

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

function HealthBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{score}</span>
    </div>
  )
}

function formatLastSeen(ts: string | null) {
  if (!ts) return 'Never'
  const diffDays = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

const TIER_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'] as const

export default function RelationshipsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!token) return
    apiClient<{ contacts: Contact[] }>('/api/contacts', { token }).then((data) => {
      setContacts(data.contacts)
      setLoading(false)
    })
  }, [token])

  const filtered = filter === 'all' ? contacts : contacts.filter((c) => c.relationship.type === filter)
  const uniqueTypes = [...new Set(contacts.map((c) => c.relationship.type))]

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading relationships...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0">
          <h1 className="font-semibold text-gray-900">Relationships</h1>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          No contacts yet
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((contact) => (
              <button
                key={contact.id}
                onClick={() => router.push(`/relationships/${contact.id}`)}
                className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-indigo-200 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-base font-medium text-gray-600 shrink-0">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{contact.name}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {contact.relationship.type.replace(/_/g, ' ')} · {TIER_LABELS[contact.relationship.importanceTier]}
                    </p>
                  </div>
                </div>
                <HealthBar score={contact.relationship.healthScore} />
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs ${
                    contact.relationship.healthTrend === 'improving' ? 'text-green-600'
                    : contact.relationship.healthTrend === 'declining' ? 'text-red-500'
                    : 'text-gray-400'
                  }`}>
                    {contact.relationship.healthTrend}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatLastSeen(contact.relationship.lastInteractionAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
