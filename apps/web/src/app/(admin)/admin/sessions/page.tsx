'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface Session {
  userId: string; email: string; name: string | null
  status: string; phone: string | null
  lastConnectedAt: string | null; reconnectCount: number
  createdAt: string
}

const STATUS_COLOR: Record<string, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-gray-500',
  error: 'bg-red-500',
  connecting: 'bg-yellow-500',
}

function fromNow(ts: string | null) {
  if (!ts) return 'never'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return `${Math.floor(diff / 1440)}d ago`
}

export default function AdminSessionsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<{ sessions: Session[] }>('/api/admin/sessions', token)
  const [killing, setKilling] = useState<string | null>(null)

  const sessions = data?.sessions ?? []
  const connected = sessions.filter((s) => s.status === 'connected').length
  const errors = sessions.filter((s) => s.status === 'error').length

  const killSession = async (userId: string) => {
    if (!token || !confirm('Kill this WhatsApp session? The user will need to reconnect.')) return
    setKilling(userId)
    try {
      await apiClient(`/api/admin/sessions/${userId}`, { method: 'DELETE', token })
      await refetch()
    } finally {
      setKilling(null)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Session Manager</h1>
          <p className="text-gray-500 text-sm">
            {connected} connected · {errors} errors · {sessions.length} total
          </p>
        </div>
        <button onClick={() => refetch()} className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium">
          Refresh
        </button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-6">
        {[
          { label: 'Connected', count: sessions.filter((s) => s.status === 'connected').length, color: 'bg-green-900/50 text-green-300 border-green-800' },
          { label: 'Disconnected', count: sessions.filter((s) => s.status === 'disconnected').length, color: 'bg-gray-800/50 text-gray-400 border-gray-700' },
          { label: 'Errors', count: sessions.filter((s) => s.status === 'error').length, color: 'bg-red-900/50 text-red-300 border-red-800' },
          { label: 'Connecting', count: sessions.filter((s) => s.status === 'connecting').length, color: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
        ].map(({ label, count, color }) => (
          <div key={label} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${color}`}>
            {label}: {count}
          </div>
        ))}
      </div>

      {/* Sessions table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['User', 'Status', 'Phone', 'Last connected', 'Reconnects', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }, (_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-800 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">No WhatsApp sessions found</td>
                </tr>
              ) : sessions.map((s) => (
                <tr key={s.userId} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${s.userId}`} className="hover:text-indigo-400 transition-colors">
                      <p className="text-white font-medium text-sm">{s.name || s.email}</p>
                      {s.name && <p className="text-gray-500 text-xs">{s.email}</p>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLOR[s.status] ?? 'bg-gray-500'}`} />
                      <span className="text-gray-300 text-xs capitalize">{s.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{s.phone || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fromNow(s.lastConnectedAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono ${s.reconnectCount > 3 ? 'text-red-400' : 'text-gray-500'}`}>
                      {s.reconnectCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={killing === s.userId || s.status === 'disconnected'}
                      onClick={() => killSession(s.userId)}
                      className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {killing === s.userId ? 'Killing…' : 'Kill'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
