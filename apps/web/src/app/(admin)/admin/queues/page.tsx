'use client'

import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { useState } from 'react'

interface QueueStat {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: boolean
}

interface QueuesResponse {
  queues: QueueStat[]
}

const BAR_COLORS = {
  waiting: 'bg-yellow-500',
  active: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  delayed: 'bg-purple-500',
}

function QueueRow({ q, token, onRefresh }: { q: QueueStat; token: string | undefined; onRefresh: () => void }) {
  const [acting, setActing] = useState<string | null>(null)
  const total = q.waiting + q.active + q.failed + q.delayed

  const act = async (action: string) => {
    if (!token) return
    setActing(action)
    try {
      await apiClient(`/api/admin/queues/${encodeURIComponent(q.name)}/${action}`, { method: 'POST', token })
      await onRefresh()
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="px-5 py-4 border-b border-gray-800 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${q.paused ? 'bg-yellow-500' : q.active > 0 ? 'bg-blue-400 animate-pulse' : 'bg-green-500'}`} />
            <p className="text-white font-semibold text-sm font-mono">{q.name}</p>
            {q.paused && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-800 font-semibold">PAUSED</span>}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs mb-3">
            {[
              { label: 'Waiting', value: q.waiting, color: 'text-yellow-400' },
              { label: 'Active', value: q.active, color: 'text-blue-400' },
              { label: 'Completed', value: q.completed, color: 'text-green-400' },
              { label: 'Failed', value: q.failed, color: q.failed > 0 ? 'text-red-400' : 'text-gray-600' },
              { label: 'Delayed', value: q.delayed, color: 'text-purple-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
                <p className="text-gray-600 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Bar visualization */}
          {total > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
              {(['waiting', 'active', 'failed', 'delayed'] as const).map((key) => {
                const val = q[key] as number
                const pct = total > 0 ? (val / total) * 100 : 0
                return pct > 0 ? (
                  <div key={key} className={`${BAR_COLORS[key]} rounded-full`} style={{ width: `${pct}%` }} />
                ) : null
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          {q.failed > 0 && (
            <button
              disabled={acting === 'retry-failed'}
              onClick={() => act('retry-failed')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors disabled:opacity-50 font-medium"
            >
              {acting === 'retry-failed' ? '…' : 'Retry failed'}
            </button>
          )}
          <button
            disabled={!!acting}
            onClick={() => act(q.paused ? 'resume' : 'pause')}
            className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium ${
              q.paused
                ? 'bg-green-900/40 text-green-300 hover:bg-green-900/60'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {acting === 'pause' || acting === 'resume' ? '…' : q.paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminQueuesPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<QueuesResponse>('/api/admin/queues', token)

  const queues = data?.queues ?? []
  const totalFailed = queues.reduce((acc, q) => acc + q.failed, 0)
  const totalActive = queues.reduce((acc, q) => acc + q.active, 0)
  const totalWaiting = queues.reduce((acc, q) => acc + q.waiting, 0)

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Queue Monitor</h1>
          <p className="text-gray-500 text-sm">
            {totalActive} active · {totalWaiting} waiting · {totalFailed > 0 ? <span className="text-red-400">{totalFailed} failed</span> : '0 failed'}
          </p>
        </div>
        <button onClick={() => refetch()} className="px-4 py-2 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium">
          Refresh
        </button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { label: 'Active jobs', value: totalActive, color: 'bg-blue-900/50 text-blue-300 border-blue-800' },
          { label: 'Waiting', value: totalWaiting, color: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
          { label: 'Failed', value: totalFailed, color: totalFailed > 0 ? 'bg-red-900/50 text-red-300 border-red-800' : 'bg-gray-800/50 text-gray-500 border-gray-700' },
          { label: 'Queues', value: queues.length, color: 'bg-gray-800/50 text-gray-400 border-gray-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${color}`}>
            {label}: {value}
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-800">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="h-4 bg-gray-800 rounded animate-pulse mb-2 w-48" />
                <div className="h-3 bg-gray-800 rounded animate-pulse w-full" />
              </div>
            ))}
          </div>
        ) : queues.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-500 text-sm">No queues found</div>
        ) : (
          queues.map((q) => (
            <QueueRow key={q.name} q={q} token={token ?? undefined} onRefresh={refetch} />
          ))
        )}
      </div>
    </div>
  )
}
